import type { ExecutionChain, ExecutionOutcome, ExecutionRecord, WorkflowStep, WorkflowStepStatistics } from '@rohinik-org/compiler'
import type { ExecutionChainExtractor } from './chain-extractor.js'

function stepFromRecord(record: ExecutionRecord, position: number): WorkflowStep {
  const stats: WorkflowStepStatistics = {
    executionCount: 1,
    outcomeDistribution: { [record.outcome]: 1 } as Readonly<Record<ExecutionOutcome, number>>,
    averageLatencyMs: record.totalLatencyMs,
  }
  return {
    skillId: record.winnerSkillId!,
    position,
    ...(record.providerResolutions[0] ? { providerId: record.providerResolutions[0].providerId } : {}),
    statistics: stats,
  }
}

export class SlidingWindowExtractor implements ExecutionChainExtractor {
  extract(chain: ExecutionChain, maxLength: number): readonly (readonly WorkflowStep[])[] {
    const records = chain.records
    const result: WorkflowStep[][] = []
    for (let start = 0; start < records.length; start++) {
      for (let len = 2; len <= maxLength && start + len <= records.length; len++) {
        const seq = records.slice(start, start + len).map((r, i) => stepFromRecord(r, i))
        result.push(seq)
      }
    }
    return result
  }
}
