import type {
  PackageProvisioningAuthorizationRecord,
  AuthorizationTransitionReason,
  AuthorizationWriteReceipt,
} from './types.js'
import { AuthorizationError } from './types.js'
import type { ProvisioningAuthorizationRecordStore, ProvisioningAuthorizationEventSink } from './ports/index.js'

export async function invalidateAuthorization(
  authorizationId: string,
  reason: AuthorizationTransitionReason,
  invalidatedAt: string,
  store: ProvisioningAuthorizationRecordStore,
  eventSink: ProvisioningAuthorizationEventSink,
): Promise<AuthorizationWriteReceipt> {
  const record = await store.getById(authorizationId)
  if (!record) throw new AuthorizationError('not-found', `Authorization not found: ${authorizationId}`, authorizationId)

  const consumableStates = ['AUTHORIZED', 'AUTHORIZED_WITH_CONDITIONS'] as const
  if (!consumableStates.some(s => s === record.state)) {
    throw new AuthorizationError('invalid-state', `Cannot invalidate authorization in state ${record.state}`, authorizationId)
  }

  const toState = reason === 'trust-superseded' || reason === 'artifact-replaced' ? 'SUPERSEDED' as const : 'INVALIDATED' as const

  const receipt = await store.transition({
    authorizationId,
    fromState: record.state,
    toState,
    reason,
    transitionedAt: invalidatedAt,
  })

  await eventSink.publish({
    eventId:         `evt-inv-${authorizationId}`,
    eventType:       toState === 'SUPERSEDED' ? 'authorization-superseded' : 'authorization-invalidated',
    authorizationId,
    requestId:       record.requestId,
    operationId:     record.operationId,
    subject:         record.subject,
    state:           toState,
    occurredAt:      invalidatedAt,
  })

  return receipt
}
