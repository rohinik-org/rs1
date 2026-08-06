import type { ExecutionState } from '@rohinik-org/execution-ir'
import {
  PublicExecutionState,
  PublicErrorCode,
  EXECUTION_PROTOCOL_VERSION,
  type PublicErrorEnvelope,
} from '@rohinik-org/execution-protocol-v1'

// Explicit table — every known internal state must appear.
// Fail-closed: unknown state throws a typed integration error rather than silently mapping.
const STATE_MAP: Readonly<Record<ExecutionState, PublicExecutionState>> = {
  CREATED:      PublicExecutionState.QUEUED,
  READY:        PublicExecutionState.ADMITTED,
  RUNNING:      PublicExecutionState.RUNNING,
  WAITING:      PublicExecutionState.WAITING,
  RETRYING:     PublicExecutionState.RUNNING,
  COMPLETED:    PublicExecutionState.COMPLETED,
  FAILED:       PublicExecutionState.FAILED,
  CANCELLED:    PublicExecutionState.CANCELLED,
  TIMED_OUT:    PublicExecutionState.FAILED,
  ROLLING_BACK: PublicExecutionState.CANCELLING,
  ROLLED_BACK:  PublicExecutionState.CANCELLED,
}

export function toPublicState(internal: ExecutionState): PublicExecutionState {
  const mapped = STATE_MAP[internal]
  if (mapped === undefined) {
    // Fail-closed: unknown internal state must not silently project to anything
    const err: PublicErrorEnvelope = {
      code:            PublicErrorCode.INTERNAL_ERROR,
      message:         `Unknown internal execution state: ${String(internal)}`,
      protocolVersion: EXECUTION_PROTOCOL_VERSION,
    }
    throw Object.assign(new Error(err.message), { publicEnvelope: err })
  }
  return mapped
}
