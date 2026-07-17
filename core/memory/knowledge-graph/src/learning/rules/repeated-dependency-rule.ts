import type { InferenceCandidate, InferenceEvidence } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { InferenceRule } from '../inference-rule.js'

interface Options { minExecutions: number; minConfidence: number }
const DEFAULTS: Options = { minExecutions: 10, minConfidence: 0.7 }

// Infers USES_PROVIDER: if skill S almost always resolves with provider P,
// emit an INFERRED edge S → P with confidence = successes / executions.
export class RepeatedDependencyRule implements InferenceRule {
  readonly ruleId = 'RepeatedDependencyRule'
  private readonly opts: Options
  constructor(opts: Partial<Options> = {}) { this.opts = { ...DEFAULTS, ...opts } }

  async infer(corpus: CorpusQueryEngine, window?: { start: string; end: string }): Promise<readonly InferenceCandidate[]> {
    const records = await corpus.query({
      ...(window ? { dateStart: window.start, dateEnd: window.end } : {}),
    })

    // Group: skillId → providerId → {executions, successes, failures}
    const map = new Map<string, Map<string, { executions: number; successes: number; failures: number }>>()
    for (const r of records) {
      if (!r.winnerSkillId) continue
      for (const pr of r.providerResolutions) {
        if (!pr.resolved) continue
        const skillKey = r.winnerSkillId
        if (!map.has(skillKey)) map.set(skillKey, new Map())
        const inner = map.get(skillKey)!
        const prev = inner.get(pr.providerId) ?? { executions: 0, successes: 0, failures: 0 }
        inner.set(pr.providerId, {
          executions: prev.executions + 1,
          successes: prev.successes + (r.outcome === 'SUCCESS' ? 1 : 0),
          failures: prev.failures + (r.outcome !== 'SUCCESS' ? 1 : 0),
        })
      }
    }

    const candidates: InferenceCandidate[] = []
    for (const [skillId, providerMap] of map) {
      for (const [providerId, ev] of providerMap) {
        if (ev.executions < this.opts.minExecutions) continue
        const confidence = ev.successes / ev.executions
        if (confidence < this.opts.minConfidence) continue
        const evidence: InferenceEvidence = { executions: ev.executions, successes: ev.successes, failures: ev.failures, sources: 1 }
        const source = `rohinik://graph/capability/${skillId.replace('@', '').replace('/', '-')}`
        const target = `rohinik://graph/provider/${providerId}`
        candidates.push({
          source, target, relationship: 'USES_PROVIDER', confidence,
          inferenceRuleId: this.ruleId, evidence,
          stableEdgeId: `edge://inferred/${source}/USES_PROVIDER/${target}`,
        })
      }
    }
    return candidates
  }
}
