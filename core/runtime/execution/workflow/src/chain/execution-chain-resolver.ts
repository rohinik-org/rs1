import type { ExecutionRecord, ExecutionChain } from '@rohinik-org/compiler'

export interface ExecutionChainResolver {
  resolve(records: readonly ExecutionRecord[]): readonly ExecutionChain[]
}
