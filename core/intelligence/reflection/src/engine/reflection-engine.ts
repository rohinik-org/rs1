import { randomUUID } from 'node:crypto'
import type { ExecutionResult, ReflectionReport, ReflectionPolicy } from '@rohinik-org/compiler'
import { DEFAULT_REFLECTION_POLICY } from '@rohinik-org/compiler'
import { ReflectionAnalyzer } from '../analyzer/reflection-analyzer.js'
import { RecommendationEngine } from './recommendation-engine.js'
import { ReflectionPolicyEngine } from '../policy/reflection-policy-engine.js'
import type { ReflectionStore } from '../store/reflection-store.js'

export class ReflectionEngine {
  private readonly analyzer = new ReflectionAnalyzer()
  private readonly recommendationEngine = new RecommendationEngine()
  private readonly policyEngine = new ReflectionPolicyEngine()
  private readonly policy: ReflectionPolicy

  constructor(private readonly store: ReflectionStore, policy?: ReflectionPolicy) {
    this.policy = policy ?? DEFAULT_REFLECTION_POLICY
  }

  async reflect(result: ExecutionResult): Promise<ReflectionReport> {
    const candidate = this.analyzer.analyze(result)
    const recommendations = this.recommendationEngine.recommend(candidate)
    const candidateWithRecs = { ...candidate, recommendations }
    const status = this.policyEngine.evaluate(candidateWithRecs, this.policy)

    const report: ReflectionReport = {
      kind: 'ReflectionReport',
      schemaVersion: '1.0',
      reportId: randomUUID(),
      executionId: result.executionId,
      createdAt: new Date().toISOString(),
      rootCause: candidate.rootCause,
      findings: candidate.findings,
      recommendations,
      status,
    }

    await this.store.save(report)
    return report
  }
}
