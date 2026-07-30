import type { QuarantineLock, QuarantineLockHandle } from '../../ports/quarantine-lock.js'

export class InMemoryQuarantineLock implements QuarantineLock {
  private readonly held = new Set<string>()

  async acquire(key: string): Promise<QuarantineLockHandle> {
    if (this.held.has(key)) {
      throw new Error(`Lock already held for key: ${key}`)
    }
    this.held.add(key)
    return {
      key,
      release: async () => {
        this.held.delete(key)
      },
    }
  }

  isHeld(key: string): boolean {
    return this.held.has(key)
  }
}
