import type { ExecutionSession, ExecutionComparison } from '@rohinik-org/evaluation-ir'

export class ExecutionComparator {
  compare(session: ExecutionSession): ExecutionComparison {
    const stepRecords = session.stepRecords
    const stepCount = stepRecords.length
    const completedSteps = stepRecords.filter(r => r.state === 'COMPLETED').length
    const failedSteps = stepRecords.filter(r => r.state === 'FAILED').length
    const cancelledSteps = stepRecords.filter(r => r.state === 'CANCELLED').length
    const totalRetries = stepRecords.reduce((sum, r) => sum + Math.max(0, r.attemptCount - 1), 0)

    const startedAt = session.startedAt.getTime()
    const completedAt = session.completedAt?.getTime() ?? session.cancelledAt?.getTime() ?? Date.now()
    const durationMs = completedAt - startedAt

    const stepSuccessRate = stepCount > 0 ? completedSteps / stepCount : 0

    return Object.freeze({
      completedSteps,
      failedSteps,
      cancelledSteps,
      totalRetries,
      durationMs,
      stepSuccessRate,
    })
  }
}
