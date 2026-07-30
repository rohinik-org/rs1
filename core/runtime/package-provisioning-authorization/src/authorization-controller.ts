import { validateProvisioningRequest } from './provisioning-request-validator.js'
import { loadProvisioningSnapshot } from './provisioning-snapshot-loader.js'
import { evaluateTrustUsability } from './trust-usability-evaluator.js'
import { evaluateQuarantineGate } from './quarantine-gate.js'
import { evaluateReevaluationGate } from './reevaluation-gate.js'
import { evaluateCapabilityScope, evaluatePermissionScope } from './capability-scope-evaluator.js'
import { evaluateProvisioningPolicy } from './provisioning-policy-evaluator.js'
import { buildAuthorizationDecision, decisionToRecord } from './authorization-decision-builder.js'
import { buildAuthorizationToken, computeTokenDigest } from './authorization-token-builder.js'
import { AuthorizationError, AuthorizationConflict } from './types.js'
import type {
  PackageProvisioningAuthorizationRequest,
  PackageProvisioningAuthorizationDecision,
  PackageProvisioningAuthorizationPolicy,
  PackageProvisioningAuthorizationRecord,
  AuthorizationToken,
  AuthorizationLifecycleState,
  AuthorizationTransitionReason,
  AuthorizationWriteReceipt,
} from './types.js'
import type {
  ProvisioningTrustRepositoryReader,
  ProvisioningQuarantineReader,
  ReevaluationStatusReader,
  ProvisioningAuthorizationRecordStore,
  ProvisioningAuthorizationLock,
  ProvisioningAuthorizationEventSink,
} from './ports/index.js'

export interface AuthorizationControllerResult {
  readonly decision: PackageProvisioningAuthorizationDecision
  readonly token?: AuthorizationToken
  readonly record?: PackageProvisioningAuthorizationRecord
  readonly idempotent: boolean
}

export interface ConsumeAuthorizationCommand {
  readonly authorizationId: string
  readonly tokenDigest: string
  readonly consumedByOperationId: string
  readonly consumedAt: string
  readonly currentRepositoryRevision: number
}

export interface AuthorizationController {
  authorize(
    req: PackageProvisioningAuthorizationRequest,
    policy: PackageProvisioningAuthorizationPolicy,
    declaredCapabilities: readonly string[],
    declaredPermissions: readonly string[],
    issuedAt: string,
  ): Promise<AuthorizationControllerResult>

  consumeAuthorization(cmd: ConsumeAuthorizationCommand): Promise<AuthorizationWriteReceipt>

  getById(authorizationId: string): Promise<PackageProvisioningAuthorizationRecord | undefined>
}

const OUTCOME_TO_STATE: Record<string, AuthorizationLifecycleState> = {
  'authorized':               'AUTHORIZED',
  'authorized-with-conditions': 'AUTHORIZED_WITH_CONDITIONS',
  'deferred':                 'DEFERRED',
  'manual-review-required':   'MANUAL_REVIEW_REQUIRED',
  'denied':                   'DENIED',
  'invalid-request':          'DENIED',
  'stale-snapshot':           'DENIED',
  'superseded':               'SUPERSEDED',
}

export function createAuthorizationController(
  trustReader: ProvisioningTrustRepositoryReader,
  quarantineReader: ProvisioningQuarantineReader,
  reevaluationReader: ReevaluationStatusReader,
  recordStore: ProvisioningAuthorizationRecordStore,
  lock: ProvisioningAuthorizationLock,
  eventSink: ProvisioningAuthorizationEventSink,
): AuthorizationController {

  async function authorize(
    req: PackageProvisioningAuthorizationRequest,
    policy: PackageProvisioningAuthorizationPolicy,
    declaredCapabilities: readonly string[],
    declaredPermissions: readonly string[],
    issuedAt: string,
  ): Promise<AuthorizationControllerResult> {
    // 1. Validate request first — zero repo calls on invalid
    try {
      validateProvisioningRequest(req)
    } catch (err) {
      if (err instanceof AuthorizationError) {
        const decision = buildAuthorizationDecision(
          req, 'invalid-request',
          [{ code: err.code, detail: err.message }],
          [], [], [], '', 0, issuedAt,
        )
        return { decision, idempotent: false }
      }
      throw err
    }

    // 2. Idempotency — check before acquiring lock
    const existing = await recordStore.getByOperationId(req.operationId)
    if (existing !== undefined) {
      // Verify same request fingerprint
      if (existing.requestId !== req.requestId) {
        throw new AuthorizationConflict('idempotency-conflict',
          `Operation ${req.operationId} already committed with different requestId`)
      }
      const decision = buildAuthorizationDecision(
        req, existing.outcome,
        existing.reasons, existing.conditions,
        existing.authorizedCapabilities, existing.authorizedPermissions,
        existing.trustDecisionRecordId, existing.repositoryRevision, existing.issuedAt,
        existing.expiresAt,
      )
      return { decision, idempotent: true, record: existing }
    }

    // 3. Lock per canonical authorization identity
    const lockKey = `${req.subject.packageId}:${req.subject.version}:${req.artifactIdentity.artifactDigest}:${req.tenantId}:${req.environmentId}`
    const lockHandle = await lock.acquire(lockKey)

    try {
      // Re-check after lock
      const existing2 = await recordStore.getByOperationId(req.operationId)
      if (existing2 !== undefined) {
        const decision = buildAuthorizationDecision(
          req, existing2.outcome,
          existing2.reasons, existing2.conditions,
          existing2.authorizedCapabilities, existing2.authorizedPermissions,
          existing2.trustDecisionRecordId, existing2.repositoryRevision, existing2.issuedAt,
          existing2.expiresAt,
        )
        return { decision, idempotent: true, record: existing2 }
      }

      await eventSink.publish({
        eventId:         `evt-req-${req.operationId}`,
        eventType:       'authorization-requested',
        authorizationId: '',
        requestId:       req.requestId,
        operationId:     req.operationId,
        subject:         req.subject,
        state:           'REQUESTED',
        occurredAt:      issuedAt,
      })

      // 4. Load snapshot
      let snapshot
      try {
        snapshot = await loadProvisioningSnapshot(req, trustReader)
      } catch (err) {
        if (err instanceof AuthorizationError) {
          const outcome = err.code === 'stale-snapshot' ? 'stale-snapshot' as const
            : err.code === 'repository-failure' ? 'deferred' as const
            : 'denied' as const
          const decision = buildAuthorizationDecision(
            req, outcome,
            [{ code: err.code, detail: err.message }],
            [], [], [], '', 0, issuedAt,
          )
          await persistAndEmit(decision, recordStore, eventSink, issuedAt)
          return { decision, idempotent: false }
        }
        throw err
      }

      // 5. Quarantine gate
      const quarantineState = await quarantineReader.getCurrentQuarantineState(req.subject, req.artifactIdentity, issuedAt)
      const quarantineResult = evaluateQuarantineGate(quarantineState, policy)
      if (!quarantineResult.pass) {
        const decision = buildAuthorizationDecision(
          req, quarantineResult.outcome,
          [...quarantineResult.reasons], [], [], [],
          snapshot.trustDecisionRecordId, snapshot.repositoryRevision, issuedAt,
        )
        await persistAndEmit(decision, recordStore, eventSink, issuedAt)
        return { decision, idempotent: false }
      }

      // 6. Reevaluation gate
      const reevalStatus = await reevaluationReader.getCurrentReevaluationStatus(snapshot.trustDecisionRecordId, issuedAt)
      const reevalResult = evaluateReevaluationGate(reevalStatus.state, policy)
      if (!reevalResult.pass) {
        const decision = buildAuthorizationDecision(
          req, reevalResult.outcome,
          [...reevalResult.reasons], [], [], [],
          snapshot.trustDecisionRecordId, snapshot.repositoryRevision, issuedAt,
        )
        await persistAndEmit(decision, recordStore, eventSink, issuedAt)
        return { decision, idempotent: false }
      }

      // 7. Trust usability
      const trustResult = evaluateTrustUsability(snapshot, policy)

      // 8. Capability / permission scope
      const capScope = evaluateCapabilityScope(
        req.requestedCapabilities, policy, declaredCapabilities,
      )
      const permScope = evaluatePermissionScope(
        req.requestedPermissions, policy, declaredPermissions,
      )

      // 9. Policy evaluation
      const policyResult = evaluateProvisioningPolicy(
        req, snapshot, policy, capScope, permScope,
        trustResult.outcome, trustResult.conditions, trustResult.reasons,
        issuedAt,
      )

      // 10. Build decision
      const decision = buildAuthorizationDecision(
        req, policyResult.outcome,
        policyResult.reasons, policyResult.conditions,
        policyResult.authorizedCapabilities, policyResult.authorizedPermissions,
        snapshot.trustDecisionRecordId, snapshot.repositoryRevision, issuedAt,
        policyResult.expiresAt,
      )

      // 11. Persist record (L-9J-1318: token only after persistence)
      const state = OUTCOME_TO_STATE[policyResult.outcome] ?? 'FAILED'
      const record = decisionToRecord(decision, state as AuthorizationLifecycleState)
      await recordStore.append(record)

      await eventSink.publish({
        eventId:         `evt-eval-${req.operationId}`,
        eventType:       outcomeToEventType(policyResult.outcome),
        authorizationId: decision.authorizationId,
        requestId:       req.requestId,
        operationId:     req.operationId,
        subject:         req.subject,
        outcome:         policyResult.outcome,
        state:           state as AuthorizationLifecycleState,
        occurredAt:      issuedAt,
      })

      // 12. Build token only for authorized outcomes
      let token: AuthorizationToken | undefined
      if (state === 'AUTHORIZED' || state === 'AUTHORIZED_WITH_CONDITIONS') {
        token = buildAuthorizationToken(decision, policy.singleUseAuthorization)
      }

      return { decision, ...(token !== undefined && { token }), record, idempotent: false }

    } finally {
      lockHandle.release()
    }
  }

  async function consumeAuthorization(cmd: ConsumeAuthorizationCommand): Promise<AuthorizationWriteReceipt> {
    const record = await recordStore.getById(cmd.authorizationId)
    if (!record) throw new AuthorizationError('not-found', `Authorization not found: ${cmd.authorizationId}`, cmd.authorizationId)

    const usableStates = ['AUTHORIZED', 'AUTHORIZED_WITH_CONDITIONS'] as const
    if (!usableStates.some(s => s === record.state)) {
      throw new AuthorizationError('not-usable', `Authorization in state ${record.state} cannot be consumed`, cmd.authorizationId)
    }

    // Expiry check
    if (record.expiresAt !== undefined && cmd.consumedAt >= record.expiresAt) {
      throw new AuthorizationError('expired', 'Authorization has expired', cmd.authorizationId)
    }

    const receipt = await recordStore.transition({
      authorizationId: cmd.authorizationId,
      fromState:       record.state,
      toState:         'CONSUMED',
      reason:          'consumed',
      transitionedAt:  cmd.consumedAt,
      consumedByOperationId: cmd.consumedByOperationId,
      tokenDigest:     cmd.tokenDigest,
    })

    await eventSink.publish({
      eventId:         `evt-consumed-${cmd.authorizationId}`,
      eventType:       'authorization-consumed',
      authorizationId: cmd.authorizationId,
      requestId:       record.requestId,
      operationId:     record.operationId,
      subject:         record.subject,
      state:           'CONSUMED',
      occurredAt:      cmd.consumedAt,
    })

    return receipt
  }

  async function getById(authorizationId: string): Promise<PackageProvisioningAuthorizationRecord | undefined> {
    return recordStore.getById(authorizationId)
  }

  return { authorize, consumeAuthorization, getById }
}

async function persistAndEmit(
  decision: PackageProvisioningAuthorizationDecision,
  store: ProvisioningAuthorizationRecordStore,
  eventSink: ProvisioningAuthorizationEventSink,
  issuedAt: string,
): Promise<void> {
  const state = (OUTCOME_TO_STATE[decision.outcome] ?? 'FAILED') as AuthorizationLifecycleState
  const record = decisionToRecord(decision, state)
  if (decision.authorizationId) await store.append(record)
  await eventSink.publish({
    eventId:         `evt-${decision.operationId}`,
    eventType:       outcomeToEventType(decision.outcome),
    authorizationId: decision.authorizationId,
    requestId:       decision.requestId,
    operationId:     decision.operationId,
    subject:         decision.subject,
    outcome:         decision.outcome,
    state,
    occurredAt:      issuedAt,
  })
}

function outcomeToEventType(outcome: string) {
  const map: Record<string, import('./types.js').AuthorizationEventType> = {
    'authorized':               'authorization-authorized',
    'authorized-with-conditions': 'authorization-authorized-with-conditions',
    'deferred':                 'authorization-deferred',
    'manual-review-required':   'authorization-manual-review-required',
    'denied':                   'authorization-denied',
    'invalid-request':          'authorization-denied',
    'stale-snapshot':           'authorization-denied',
    'superseded':               'authorization-superseded',
  }
  return map[outcome] ?? 'authorization-failed'
}
