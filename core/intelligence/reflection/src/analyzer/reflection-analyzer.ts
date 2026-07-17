import { randomUUID } from 'node:crypto'
import type { ExecutionResult, ReflectionCandidate } from '@rohinik-org/compiler'
import { RootCauseAnalyzer } from '../critics/root-cause-analyzer.js'
import { PlanCritic, ExecutionCritic, ProviderCritic } from '../critics/critics.js'

export class ReflectionAnalyzer {
  private readonly critics = [new PlanCritic(), new ExecutionCritic(), new ProviderCritic()]
  private readonly rootCauseAnalyzer = new RootCauseAnalyzer()

  analyze(result: ExecutionResult): ReflectionCandidate {
    const findings = this.critics.flatMap(c => c.analyze(result))
    const rootCause = this.rootCauseAnalyzer.analyze(result)

    return {
      kind: 'ReflectionCandidate',
      schemaVersion: '1.0',
      candidateId: randomUUID(),
      executionId: result.executionId,
      generatedAt: new Date().toISOString(),
      findings,
      rootCause,
      recommendations: [],
    }
  }
}
