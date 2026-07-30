import type { ReevaluationLock, ReevaluationLockHandle } from '../../ports/reevaluation-lock.js'

export class InMemoryReevaluationLock implements ReevaluationLock {
  private readonly held = new Set<string>()
  simulateContention = false

  async acquire(key: string): Promise<ReevaluationLockHandle> {
    if (this.simulateContention) throw new Error('lock-contention')
    this.held.add(key)
    return {
      key,
      release: async () => { this.held.delete(key) },
    }
  }

  isHeld(key: string): boolean {
    return this.held.has(key)
  }
}
