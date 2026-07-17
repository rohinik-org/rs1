import type { AgentResult, AgentTask, MemoryPromotionDecision } from '@rohinik-org/compiler'

export class MemoryPromotionEngine {
  // evaluates which (if any) ephemeral memory entries from results should survive task end
  // ponytail: no real memory payload at this layer — promotes by inferenceChainId as stand-in memory reference
  evaluate(results: readonly AgentResult[], tasks: readonly AgentTask[]): readonly MemoryPromotionDecision[] {
    return tasks.map(task => {
      const taskResults = results.filter(r => r.taskId === task.taskId)
      const promotedIds = taskResults.map(r => r.inferenceChainId)
      return {
        decisionId: crypto.randomUUID(),
        taskId: task.taskId,
        promotedMemoryIds: promotedIds,
        discardedMemoryIds: [],
        promotedTo: 'TASK' as const,
        rationale: promotedIds.length > 0
          ? [`promoted ${promotedIds.length} inference chain(s) from task ${task.taskId}`]
          : ['no results to promote'],
      }
    })
  }
}
