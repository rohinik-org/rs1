export interface RepositoryTransaction {
  readonly transactionId: string
  commit(): Promise<void>
  rollback(): Promise<void>
}
