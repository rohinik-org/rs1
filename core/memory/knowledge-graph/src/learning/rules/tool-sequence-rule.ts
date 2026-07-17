import type { InferenceCandidate, InferenceEvidence } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { InferenceRule } from '../inference-rule.js'

interface Options { minSequences: number; minConfidence: number }
const DEFAULTS: Options = { minSequences: 10, minConfidence: 0.7 }

// Infers DEPENDS_ON: if skill B's requestId prefix consistently follows skill A's prefix
// (sequential steps in a multi-step request), B likely depends on A.
// Detection heuristic: requestId pattern "<prefix>-step<N>" — groups by prefix, orders by step N.
export class ToolSequenceRule implements InferenceRule {
  readonly ruleId = 'ToolSequenceRule'
  private readonly opts: Options
  constructor(opts: Partial<Options> = {}) { this.opts = { ...DEFAULTS, ...opts } }

  async infer(corpus: CorpusQueryEngine, window?: { start: string; end: string }): Promise<readonly InferenceCandidate[]> {
    const records = await corpus.query({ ...(window ? { dateStart: window.start, dateEnd: window.end } : {}) })

    // Group records by their session prefix (everything before the last -stepN suffix)
    const sessions = new Map<string, Array<{ skillId: string; step: number }>>()
    for (const r of records) {
      if (!r.winnerSkillId) continue
      const match = r.requestId.match(/^(.+)-step(\d+)$/)
      if (!match) continue
      const [, prefix, stepStr] = match
      const step = parseInt(stepStr!, 10)
      if (!sessions.has(prefix!)) sessions.set(prefix!, [])
      sessions.get(prefix!)!.push({ skillId: r.winnerSkillId, step })
    }

    // Count consecutive pairs A → B
    const pairs = new Map<string, { count: number; skillA: string; skillB: string }>()
    for (const steps of sessions.values()) {
      const sorted = steps.sort((a, b) => a.step - b.step)
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i]!.skillId; const b = sorted[i + 1]!.skillId
        const key = `${a}→${b}`
        const prev = pairs.get(key) ?? { count: 0, skillA: a, skillB: b }
        pairs.set(key, { ...prev, count: prev.count + 1 })
      }
    }

    const candidates: InferenceCandidate[] = []
    for (const [, { count, skillA, skillB }] of pairs) {
      if (count < this.opts.minSequences) continue
      const confidence = Math.min(count / (count + 5), 0.95)
      if (confidence < this.opts.minConfidence) continue
      const evidence: InferenceEvidence = { executions: count, successes: count, failures: 0, sources: 1 }
      const src = `rohinik://graph/capability/${skillB.replace('@', '').replace('/', '-')}`
      const tgt = `rohinik://graph/capability/${skillA.replace('@', '').replace('/', '-')}`
      candidates.push({
        source: src, target: tgt, relationship: 'DEPENDS_ON', confidence,
        inferenceRuleId: this.ruleId, evidence,
        stableEdgeId: `edge://inferred/${src}/DEPENDS_ON/${tgt}`,
      })
    }
    return candidates
  }
}
