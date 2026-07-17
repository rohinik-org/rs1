import type { ExecutionRecord } from './execution-record.js'

export interface ExecutionChain {
  readonly chainId: string
  readonly records: readonly ExecutionRecord[]
  readonly corpusRevision: number
  readonly startedAt: string
  readonly completedAt: string
}
