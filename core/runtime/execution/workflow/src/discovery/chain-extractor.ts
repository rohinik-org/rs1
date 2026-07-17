import type { ExecutionChain, WorkflowStep } from '@rohinik-org/compiler'

export interface ExecutionChainExtractor {
  extract(chain: ExecutionChain, maxLength: number): readonly (readonly WorkflowStep[])[]
}
