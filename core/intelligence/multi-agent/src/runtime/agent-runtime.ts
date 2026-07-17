import type { AgentTask, AgentResult } from '@rohinik-org/compiler'
import { AgentJournal } from '../session/agent-journal.js'

// isolated per-task execution context — stateless except journal reference
export class AgentRuntime {
  constructor(private readonly journal: AgentJournal) {}

  async execute(task: AgentTask, sessionId: string): Promise<AgentResult> {
    this.journal.append(sessionId, 'TASK_STARTED', task.assignedAgentId, { taskId: task.taskId })
    const result: AgentResult = {
      resultId: crypto.randomUUID(),
      agentId: task.assignedAgentId,
      taskId: task.taskId,
      inferenceChainId: `chain-${task.taskId}`,
      completedAt: new Date().toISOString(),
    }
    this.journal.append(sessionId, 'TASK_COMPLETED', task.assignedAgentId, { taskId: task.taskId, resultId: result.resultId })
    return result
  }
}
