import { randomUUID } from 'node:crypto'
import type { ExecutionResult, RootCause } from '@rohinik-org/compiler'

export class RootCauseAnalyzer {
  analyze(result: ExecutionResult): RootCause {
    const { reason } = result.termination
    const causeId = randomUUID()
    const evidence = [result.executionId]

    if (reason === 'TIMEOUT') return { causeId, category: 'TIMEOUT', confidence: 1.0, evidence }
    if (reason === 'PROVIDER_ERROR') return { causeId, category: 'PROVIDER_FAILURE', confidence: 1.0, evidence }
    if (reason === 'POLICY_VIOLATION') return { causeId, category: 'POLICY', confidence: 1.0, evidence }

    if (reason === 'FAILED') {
      const hasNetwork = result.stepRecords.some(
        s => typeof s.error === 'string' && /network|timeout/i.test(s.error),
      )
      if (hasNetwork) return { causeId, category: 'NETWORK', confidence: 0.7, evidence }

      const allSkipped = result.stepRecords.length > 0 && result.stepRecords.every(s => s.state === 'SKIPPED')
      if (allSkipped) return { causeId, category: 'MISSING_CAPABILITY', confidence: 0.8, evidence }

      return { causeId, category: 'UNKNOWN', confidence: 0.5, evidence }
    }

    // SUCCESS, CANCELLED, BUDGET_EXCEEDED
    return { causeId, category: 'UNKNOWN', confidence: 0.0, evidence }
  }
}
