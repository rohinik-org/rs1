import type { ExecutionResult, ExecutionSession, ObservedOutcome } from '@rohinik-org/evaluation-ir'

export class OutcomeCollector {
  collect(execution: ExecutionResult, session: ExecutionSession): ObservedOutcome {
    const stepRecords = session.stepRecords
    const failedStepCount = stepRecords.filter(r => r.state === 'FAILED').length
    const retryCount = stepRecords.reduce((sum, r) => sum + Math.max(0, r.attemptCount - 1), 0)

    return Object.freeze({
      finalState: execution.finalState,
      totalDurationMs: execution.totalDurationMs,
      stepCount: stepRecords.length,
      failedStepCount,
      retryCount,
      ...(session.cancelledAt !== undefined ? { cancelledAt: session.cancelledAt } : {}),
    })
  }
}
