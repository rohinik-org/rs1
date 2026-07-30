import type { ReevaluationLockHandle } from '../types.js'

export type { ReevaluationLockHandle }

export interface ReevaluationLock {
  acquire(key: string): Promise<ReevaluationLockHandle>
}
