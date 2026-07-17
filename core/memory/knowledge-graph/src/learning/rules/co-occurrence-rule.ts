import type { InferenceCandidate, InferenceEvidence } from '@rohinik-org/compiler'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { InferenceRule } from '../inference-rule.js'

interface Options { minCoOccurrences: number; minConfidence: number }
const DEFAULTS: Options = { minCoOccurrences: 10, minConfidence: 0.6 }

// Infers ALTERNATIVE_TO: if skills A and B appear together as candidates in many requests,
// they likely serve similar purposes.
export class CoOccurrenceRule implements InferenceRule {
  readonly ruleId = 'CoOccurrenceRule'
  private readonly opts: Options
  constructor(opts: Partial<Options> = {}) { this.opts = { ...DEFAULTS, ...opts } }

  async infer(corpus: CorpusQueryEngine, window?: { start: string; end: string }): Promise<readonly InferenceCandidate[]> {
    const records = await corpus.query({ ...(window ? { dateStart: window.start, dateEnd: window.end } : {}) })

    // pair key "A|B" (sorted) → {coOccurrences, skillA, skillB}
    const pairs = new Map<string, { coOccurrences: number; skillA: string; skillB: string }>()
    const totals = new Map<string, number>()

    for (const r of records) {
      const skills = [...new Set(r.allCandidates.map(c => c.skillId))].sort()
      for (const s of skills) totals.set(s, (totals.get(s) ?? 0) + 1)
      for (let i = 0; i < skills.length; i++) {
        for (let j = i + 1; j < skills.length; j++) {
          const key = `${skills[i]}|${skills[j]}`
          const prev = pairs.get(key) ?? { coOccurrences: 0, skillA: skills[i]!, skillB: skills[j]! }
          pairs.set(key, { ...prev, coOccurrences: prev.coOccurrences + 1 })
        }
      }
    }

    const candidates: InferenceCandidate[] = []
    for (const [, { coOccurrences, skillA, skillB }] of pairs) {
      if (coOccurrences < this.opts.minCoOccurrences) continue
      const totalA = totals.get(skillA) ?? 0
      const totalB = totals.get(skillB) ?? 0
      const confidence = coOccurrences / Math.max(Math.min(totalA, totalB), 1)
      if (confidence < this.opts.minConfidence) continue
      const evidence: InferenceEvidence = { executions: coOccurrences, successes: coOccurrences, failures: 0, sources: 1 }
      const src = `rohinik://graph/capability/${skillA.replace('@', '').replace('/', '-')}`
      const tgt = `rohinik://graph/capability/${skillB.replace('@', '').replace('/', '-')}`
      candidates.push({
        source: src, target: tgt, relationship: 'ALTERNATIVE_TO', confidence,
        inferenceRuleId: this.ruleId, evidence,
        stableEdgeId: `edge://inferred/${src}/ALTERNATIVE_TO/${tgt}`,
      })
    }
    return candidates
  }
}
