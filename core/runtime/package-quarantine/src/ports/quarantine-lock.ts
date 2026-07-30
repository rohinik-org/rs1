export interface QuarantineLockHandle {
  readonly key: string
  release(): Promise<void>
}

export interface QuarantineLock {
  acquire(key: string): Promise<QuarantineLockHandle>
}
