import type { ExecutionState } from '@rohinik-org/compiler'

const VALID_TRANSITIONS: Readonly<Record<ExecutionState, readonly ExecutionState[]>> = {
  PENDING:   ['RUNNING', 'CANCELLED'],
  RUNNING:   ['COMPLETED', 'FAILED', 'CANCELLED', 'WAITING', 'TIMEOUT'],
  WAITING:   ['RUNNING', 'CANCELLED', 'TIMEOUT'],
  COMPLETED: [],
  FAILED:    [],
  CANCELLED: [],
  TIMEOUT:   [],
}

export class ExecutionStateMachine {
  private _state: ExecutionState = 'PENDING'

  get state(): ExecutionState { return this._state }

  transition(next: ExecutionState): void {
    const allowed = VALID_TRANSITIONS[this._state]
    if (!allowed.includes(next)) {
      throw new Error(`Invalid transition: ${this._state} → ${next}`)
    }
    this._state = next
  }
}
