import type { ArtifactStorage } from './ports/artifact-storage.js'
import type { QuarantineStorage } from './ports/quarantine-storage.js'
import type { QuarantineLock } from './ports/quarantine-lock.js'
import type { QuarantineEventSink } from './ports/quarantine-event-sink.js'
import type {
  PackageQuarantineRequest,
  PackageQuarantineResult,
  QuarantineLifecycleTransition,
  QuarantineRecord,
  QuarantineId,
  PackageQuarantineEvidence,
} from './types.js'
import { validateQuarantineRequest } from './quarantine-request-validator.js'
import { validateTrustDecision } from './trust-decision-validator.js'
import { evaluateQuarantinePolicy } from './quarantine-policy-evaluator.js'
import { resolveQuarantineMode } from './quarantine-mode-resolver.js'
import { resolveQuarantineLocation } from './quarantine-location-resolver.js'
import { buildContainmentPlan } from './containment-plan-builder.js'
import { QuarantineExecutor } from './quarantine-executor.js'
import { verifyContainment } from './containment-verifier.js'
import { validateTransition } from './quarantine-state-machine.js'
import { buildQuarantineEvidence } from './quarantine-evidence-builder.js'
import { buildQuarantineResult } from './quarantine-result-builder.js'
import type { StorageReceipt } from './types.js'

type EvidenceParams = Parameters<typeof buildQuarantineEvidence>[0]

export class QuarantineController {
  private readonly executor: QuarantineExecutor

  constructor(
    private readonly artifactStorage: ArtifactStorage,
    private readonly quarantineStorage: QuarantineStorage,
    private readonly lock: QuarantineLock,
    private readonly eventSink: QuarantineEventSink,
  ) {
    this.executor = new QuarantineExecutor(artifactStorage, quarantineStorage, lock, eventSink)
  }

  async quarantine(request: PackageQuarantineRequest): Promise<PackageQuarantineResult> {
    // Step 1: Validate request
    const requestValidation = validateQuarantineRequest(request)
    if (!requestValidation.valid) {
      return this.buildFailureResult(request, 'invalid-request', requestValidation.reason)
    }

    // Step 2: Idempotency check (L-9J-1010, L-9J-1011)
    const existing = await this.quarantineStorage.findByOperationId(request.operationId)
    if (existing) {
      const r = existing.result
      const compatible =
        r.subject.packageId === request.subject.packageId &&
        r.subject.version === request.subject.version &&
        r.trustDecision === request.trustDecision &&
        r.evidence.sourceLocation === request.artifact.sourceLocation
      if (!compatible) {
        // L-9J-1011: different inputs → fail closed
        return this.buildFailureResult(request, 'invalid-request', `operationId ${request.operationId} already used with different inputs`)
      }
      return existing.result
    }

    // Step 3: Validate trust decision consistency
    const tdValidation = validateTrustDecision(request)
    if (!tdValidation.valid) {
      return this.buildFailureResult(request, 'invalid-request', tdValidation.reason)
    }

    // Step 4: Evaluate policy (L-9J-1020)
    const policyRequirement = evaluateQuarantinePolicy(request, request.policy)
    if (policyRequirement === 'not-required') {
      const evidence = buildQuarantineEvidence({
        operationId: request.operationId,
        subject: request.subject,
        trustDecisionId: request.trustDecisionId ?? '',
        trustDecision: request.trustDecision,
        policyId: request.policy.policyId,
        policyVersion: request.policy.policyVersion,
        mode: request.policy.defaultMode,
        sourceLocation: request.artifact.sourceLocation,
        storageReceipts: [],
        verificationFindings: [],
        lifecycleTransitions: [{ from: 'UNQUARANTINED', to: 'UNQUARANTINED', at: request.requestedAt, reason: 'not-required' }],
        restrictions: [],
        requestedAt: request.requestedAt,
      })
      const result: PackageQuarantineResult = {
        operationId: request.operationId,
        subject: request.subject,
        outcome: 'not-required',
        trustDecision: request.trustDecision,
        trustDecisionId: request.trustDecisionId ?? '',
        policyId: request.policy.policyId,
        policyVersion: request.policy.policyVersion,
        evidence,
        requestedAt: request.requestedAt,
      }
      await this.quarantineStorage.recordResult(result)
      return result
    }
    if (policyRequirement === 'policy-conflict') {
      return this.buildFailureResult(request, 'policy-conflict', 'conflicting emergency rules')
    }

    // Lifecycle: UNQUARANTINED → PLANNED
    const transitions: QuarantineLifecycleTransition[] = []
    if (!validateTransition('UNQUARANTINED', 'PLANNED')) throw new Error('invalid state transition')
    transitions.push({ from: 'UNQUARANTINED', to: 'PLANNED', at: request.requestedAt })

    // Step 5: Resolve mode
    let mode
    try {
      mode = resolveQuarantineMode(request.policy)
    } catch (err) {
      return this.buildFailureResult(request, 'containment-failed', err instanceof Error ? err.message : String(err), transitions)
    }

    // Step 6: Resolve location
    let destinationLocation: string | undefined
    try {
      destinationLocation = resolveQuarantineLocation(request.subject, request.context, request.operationId)
    } catch (err) {
      return this.buildFailureResult(request, 'containment-failed', err instanceof Error ? err.message : String(err), transitions)
    }

    // Step 7: Build containment plan
    const plan = buildContainmentPlan({
      operationId: request.operationId,
      subject: request.subject,
      trustDecisionId: request.trustDecisionId ?? '',
      mode,
      sourceLocation: request.artifact.sourceLocation,
      plannedAt: request.requestedAt,
      ...(destinationLocation !== undefined ? { destinationLocation } : {}),
    })

    // PLANNED → CONTAINING
    if (!validateTransition('PLANNED', 'CONTAINING')) throw new Error('invalid state transition')
    transitions.push({ from: 'PLANNED', to: 'CONTAINING', at: request.requestedAt })

    // Step 8: Execute plan
    const execResult = await this.executor.execute(plan, request)

    if (!execResult.success) {
      const isPartial = execResult.partial
      const finalState = isPartial ? 'VERIFICATION_FAILED' : 'CONTAINMENT_FAILED'
      if (!validateTransition('CONTAINING', finalState)) throw new Error('invalid state transition')
      const failReason = execResult.failureReason ?? 'execution failed'
      const transitionEntry: QuarantineLifecycleTransition = { from: 'CONTAINING', to: finalState, at: request.requestedAt, reason: failReason }
      transitions.push(transitionEntry)

      const outcome = isPartial ? 'verification-failed' : 'containment-failed'
      const vFindings = isPartial ? [failReason] : []
      const manualReason = isPartial ? `Source was moved but destination verification failed: ${failReason}` : undefined
      const evidenceParams: EvidenceParams = {
        operationId: request.operationId,
        subject: request.subject,
        trustDecisionId: request.trustDecisionId ?? '',
        trustDecision: request.trustDecision,
        policyId: request.policy.policyId,
        policyVersion: request.policy.policyVersion,
        mode,
        sourceLocation: request.artifact.sourceLocation,
        storageReceipts: execResult.receipts,
        verificationFindings: vFindings,
        lifecycleTransitions: transitions,
        restrictions: [],
        requestedAt: request.requestedAt,
        failureReason: failReason,
        ...(destinationLocation !== undefined ? { destinationLocation } : {}),
        ...(manualReason !== undefined ? { manualInterventionReason: manualReason } : {}),
      }
      const evidence = buildQuarantineEvidence(evidenceParams)
      const result = buildQuarantineResult({ request, outcome, evidence })
      await this.quarantineStorage.recordResult(result)
      return result
    }

    // Step 9: Verify containment
    let verificationFindings: readonly string[] = []
    if (request.policy.requireDestinationVerification) {
      const vResult = await verifyContainment(plan, execResult.receipts, request, this.artifactStorage)
      verificationFindings = vResult.findings
      if (!vResult.verified) {
        if (!validateTransition('CONTAINING', 'VERIFICATION_FAILED')) throw new Error('invalid state transition')
        const findingsStr = vResult.findings.join('; ')
        const t: QuarantineLifecycleTransition = { from: 'CONTAINING', to: 'VERIFICATION_FAILED', at: request.requestedAt, reason: findingsStr }
        transitions.push(t)
        const evidenceParams: EvidenceParams = {
          operationId: request.operationId,
          subject: request.subject,
          trustDecisionId: request.trustDecisionId ?? '',
          trustDecision: request.trustDecision,
          policyId: request.policy.policyId,
          policyVersion: request.policy.policyVersion,
          mode,
          sourceLocation: request.artifact.sourceLocation,
          storageReceipts: execResult.receipts,
          verificationFindings,
          lifecycleTransitions: transitions,
          restrictions: [],
          requestedAt: request.requestedAt,
          failureReason: findingsStr,
          ...(destinationLocation !== undefined ? { destinationLocation } : {}),
        }
        const evidence = buildQuarantineEvidence(evidenceParams)
        const result = buildQuarantineResult({ request, outcome: 'verification-failed', evidence })
        await this.quarantineStorage.recordResult(result)
        return result
      }
    }

    // Step 10: Determine final lifecycle state
    const degraded = execResult.receipts.some(r => r.operation.startsWith('failed:'))
    let finalOutcome: 'quarantined' | 'quarantined-degraded' | 'manual-intervention-required'

    if (mode === 'manual-containment') {
      if (!validateTransition('CONTAINING', 'MANUAL_INTERVENTION_REQUIRED')) throw new Error('invalid state transition')
      transitions.push({ from: 'CONTAINING', to: 'MANUAL_INTERVENTION_REQUIRED', at: request.requestedAt })
      finalOutcome = 'manual-intervention-required'
    } else if (degraded && request.policy.allowDegradedContainment) {
      if (!validateTransition('CONTAINING', 'QUARANTINED_DEGRADED')) throw new Error('invalid state transition')
      transitions.push({ from: 'CONTAINING', to: 'QUARANTINED_DEGRADED', at: request.requestedAt })
      finalOutcome = 'quarantined-degraded'
    } else {
      if (!validateTransition('CONTAINING', 'QUARANTINED')) throw new Error('invalid state transition')
      transitions.push({ from: 'CONTAINING', to: 'QUARANTINED', at: request.requestedAt })
      finalOutcome = 'quarantined'
    }

    // Step 11: Build evidence
    const restrictions = policyRequirement === 'required-with-restrictions' ? ['conditional-trust-restrictions-apply'] : []
    const manualReason = finalOutcome === 'manual-intervention-required' ? 'manual-containment mode requires operator intervention' : undefined

    const evidenceParams: EvidenceParams = {
      operationId: request.operationId,
      subject: request.subject,
      trustDecisionId: request.trustDecisionId ?? '',
      trustDecision: request.trustDecision,
      policyId: request.policy.policyId,
      policyVersion: request.policy.policyVersion,
      mode,
      sourceLocation: request.artifact.sourceLocation,
      storageReceipts: execResult.receipts,
      verificationFindings,
      lifecycleTransitions: transitions,
      restrictions,
      requestedAt: request.requestedAt,
      ...(destinationLocation !== undefined ? { destinationLocation } : {}),
      ...(manualReason !== undefined ? { manualInterventionReason: manualReason } : {}),
    }
    const evidence = buildQuarantineEvidence(evidenceParams)

    // Build quarantine record
    const quarantineRecord: QuarantineRecord = {
      quarantineId: `qid-${request.operationId}` as QuarantineId,
      subject: request.subject,
      reasonCodes: request.trustDecisionReasonCodes ?? [],
      placedAt: request.requestedAt,
      evidenceSemanticHash: `hash-${request.operationId}`,
      status: 'active',
      ...(request.trustDecisionId !== undefined ? { trustDecisionId: request.trustDecisionId as import('@rohinik-org/package-trust-ir').TrustDecisionId } : {}),
    }

    // Step 12: Build result
    const result = buildQuarantineResult({ request, outcome: finalOutcome, evidence, quarantineRecord })

    // Step 13: Record result
    await this.quarantineStorage.recordResult(result)

    return result
  }

  private buildFailureResult(
    request: PackageQuarantineRequest,
    outcome: 'invalid-request' | 'containment-failed' | 'policy-conflict',
    reason: string | undefined,
    transitions?: QuarantineLifecycleTransition[],
  ): PackageQuarantineResult {
    const evidenceParams: EvidenceParams = {
      operationId: request.operationId,
      subject: request.subject,
      trustDecisionId: request.trustDecisionId ?? '',
      trustDecision: request.trustDecision,
      policyId: request.policy?.policyId ?? 'unknown',
      policyVersion: request.policy?.policyVersion ?? 'unknown',
      mode: request.policy?.defaultMode ?? 'deny-activation',
      sourceLocation: request.artifact?.sourceLocation ?? 'unknown',
      storageReceipts: [],
      verificationFindings: [],
      lifecycleTransitions: transitions ?? [],
      restrictions: [],
      requestedAt: request.requestedAt,
      ...(reason !== undefined ? { failureReason: reason } : {}),
    }
    const evidence = buildQuarantineEvidence(evidenceParams)
    return {
      operationId: request.operationId,
      subject: request.subject,
      outcome,
      trustDecision: request.trustDecision,
      trustDecisionId: request.trustDecisionId ?? '',
      policyId: request.policy?.policyId ?? 'unknown',
      policyVersion: request.policy?.policyVersion ?? 'unknown',
      evidence,
      requestedAt: request.requestedAt,
    }
  }
}
