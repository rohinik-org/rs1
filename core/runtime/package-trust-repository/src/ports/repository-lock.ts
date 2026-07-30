export interface RepositoryLockHandle {
  release(): Promise<void>
}

export interface RepositoryLock {
  acquire(partitionKey: string): Promise<RepositoryLockHandle>
}
