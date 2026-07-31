import {
  EvidenceCompletionState,
  EvidenceSchemaVersion,
  CANONICALIZATION_VERSION,
  EvidenceErrorCode,
  EvidenceOutcome,
  executionEvidenceId,
  computeEvidenceHash,
} from '@rohinik-org/execution-evidence-ir'
import type {
  ExecutionEvidenceId,
  IntelligentExecutionId,
  ExecutionSessionId,
  TraceId,
  SpanId,
  ContentHash,
  ContextAdmissionReference,
  CapabilityBindingReference,
  RoutingDecisionReference,
  PolicyDecisionReference,
  TokenUsageObservation,
  CostObservation,
  SealedExecutionEvidence,
  SupersessionReference,
  Clock,
  IdGenerator,
  ContentHasher,
  RetryId,
  FallbackId,
} from '@rohinik-org/execution-evidence-ir'
import { ExecutionAccumulator } from './accumulator.js'

export interface OpenParams {
  readonly intelligentExecutionId: IntelligentExecutionId
  readonly executionSessionId:     ExecutionSessionId
  readonly operationKind:          string
  readonly traceId?:               TraceId
  readonly spanId?:                SpanId
  readonly requiresContextAdmission?: boolean
}

export interface OpenCorrectionParams extends OpenParams {
  readonly supersedesEvidenceId:   ExecutionEvidenceId
  readonly supersedesEvidenceHash: string
  readonly correctionReason:       string
}

export class ExecutionEvidenceBuilder {
  private readonly accumulators  = new Map<string, ExecutionAccumulator>()
  private readonly supersessions = new Map<string, SupersessionReference>()
  private readonly contextRequired = new Set<string>()

  constructor(
    private readonly clock:   Clock,
    private readonly idGen:   IdGenerator,
    private readonly hasher:  ContentHasher,
  ) {}

  open(params: OpenParams): ExecutionEvidenceId {
    const id  = executionEvidenceId(this.idGen.generate())
    const acc = ExecutionAccumulator.open({
      evidenceId:             id,
      intelligentExecutionId: params.intelligentExecutionId,
      executionSessionId:     params.executionSessionId,
      operationKind:          params.operationKind,
      startedAt:              this.clock.now(),
      ...(params.traceId ? { traceId: params.traceId } : {}),
      ...(params.spanId  ? { spanId:  params.spanId  } : {}),
    })
    this.accumulators.set(id, acc)
    if (params.requiresContextAdmission) this.contextRequired.add(id)
    return id
  }

  openCorrection(params: OpenCorrectionParams): ExecutionEvidenceId {
    const id = this.open(params)
    this.supersessions.set(id, {
      supersedesEvidenceId:   params.supersedesEvidenceId,
      supersedesEvidenceHash: params.supersedesEvidenceHash,
      correctionReason:       params.correctionReason,
    })
    return id
  }

  private getAcc(id: ExecutionEvidenceId): ExecutionAccumulator {
    const acc = this.accumulators.get(id)
    if (!acc) throw new Error(`${EvidenceErrorCode.EVIDENCE_NOT_FOUND}: evidence '${id}' not found`)
    return acc
  }

  recordContextAdmission(id: ExecutionEvidenceId, ref: ContextAdmissionReference): void {
    this.getAcc(id).setContextAdmissionRef(ref)
  }
  recordCapabilityBinding(id: ExecutionEvidenceId, ref: CapabilityBindingReference): void {
    this.getAcc(id).setCapabilityBindingRef(ref)
  }
  recordRoutingDecision(id: ExecutionEvidenceId, ref: RoutingDecisionReference): void {
    this.getAcc(id).setRoutingDecisionRef(ref)
  }
  recordPolicyDecision(id: ExecutionEvidenceId, ref: PolicyDecisionReference): void {
    this.getAcc(id).setPolicyDecisionRef(ref)
  }
  recordTokenUsage(id: ExecutionEvidenceId, usage: TokenUsageObservation): void {
    this.getAcc(id).setTokenUsage(usage)
  }
  recordCost(id: ExecutionEvidenceId, cost: CostObservation): void {
    this.getAcc(id).setCost(cost)
  }
  recordInputHash(id: ExecutionEvidenceId, hash: ContentHash): void {
    this.getAcc(id).setInputHash(hash)
  }
  recordOutputHash(id: ExecutionEvidenceId, hash: ContentHash): void {
    this.getAcc(id).setOutputHash(hash)
  }
  recordPrivacyBoundary(id: ExecutionEvidenceId, preserved: boolean): void {
    this.getAcc(id).setPrivacyBoundaryPreserved(preserved)
  }
  recordRetry(id: ExecutionEvidenceId, ref: RetryId): void {
    this.getAcc(id).appendRetry(ref)
  }
  recordFallback(id: ExecutionEvidenceId, ref: FallbackId): void {
    this.getAcc(id).appendFallback(ref)
  }

  seal(id: ExecutionEvidenceId, outcome: EvidenceOutcome, completedAt: Date): SealedExecutionEvidence {
    const acc = this.getAcc(id)

    // Context-required success must have admission reference
    if (
      outcome === EvidenceOutcome.SUCCESS &&
      this.contextRequired.has(id) &&
      acc.contextRef === undefined
    ) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_MISSING_REQUIRED_FIELD}: context-required success needs contextAdmissionRef`)
    }

    acc.setOutcome(outcome)
    acc.seal(completedAt)

    const supersedes = this.supersessions.get(id)
    const producedAt = this.clock.now()

    // Build the partial record (evidenceHash computed after)
    const partial: Omit<SealedExecutionEvidence, 'evidenceHash'> = {
      evidenceId:              acc.evidenceId,
      schemaVersion:           EvidenceSchemaVersion,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      completionState:         EvidenceCompletionState.SEALED,
      intelligentExecutionId:  acc.intelligentExecutionId,
      executionSessionId:      acc.executionSessionId,
      operationKind:           acc.operationKind,
      startedAt:               acc.startedAt,
      completedAt:             acc.completedAt!,
      outcome,
      retryCount:              acc.retryCount,
      fallbackCount:           acc.fallbackCount,
      producedAt,
      ...(acc.traceId              ? { traceId:               acc.traceId }              : {}),
      ...(acc.spanId               ? { spanId:                acc.spanId }               : {}),
      ...(acc.contextRef           ? { contextAdmissionRef:   acc.contextRef }           : {}),
      ...(acc.capabilityRef        ? { capabilityBindingRef:  acc.capabilityRef }        : {}),
      ...(acc.routingRef           ? { routingDecisionRef:    acc.routingRef }           : {}),
      ...(acc.policyRef            ? { policyDecisionRef:     acc.policyRef }            : {}),
      ...(acc.inputHash            ? { inputHash:             acc.inputHash }            : {}),
      ...(acc.outputHash           ? { outputHash:            acc.outputHash }           : {}),
      ...(acc.tokenUsage           ? { tokenUsage:            acc.tokenUsage }           : {}),
      ...(acc.cost                 ? { cost:                  acc.cost }                 : {}),
      ...(acc.privacyBoundary !== undefined ? { privacyBoundaryPreserved: acc.privacyBoundary } : {}),
      ...(supersedes               ? { supersedes }                                      : {}),
    }

    const withEmptyHash = { ...partial, evidenceHash: '' } as SealedExecutionEvidence
    const evidenceHash  = computeEvidenceHash(withEmptyHash)
    const sealed        = Object.freeze({ ...partial, evidenceHash }) as SealedExecutionEvidence

    this.accumulators.delete(id)
    return sealed
  }
}
