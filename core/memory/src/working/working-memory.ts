export class WorkingMemory {
  readonly executionId: string
  private readonly store = new Map<string, unknown>()

  constructor(executionId: string) {
    this.executionId = executionId
  }

  set(key: string, value: unknown): void { this.store.set(key, value) }
  get(key: string): unknown { return this.store.get(key) }
  has(key: string): boolean { return this.store.has(key) }
  clear(): void { this.store.clear() }
}
