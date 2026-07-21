import { createHash, randomUUID } from 'node:crypto'
import type { KnowledgeFragment } from '@rohinik-org/knowledge'
import type { InstalledCapability, CapabilityRegistry } from '@rohinik-org/capability-registry'
import type {
  WorkingContextIR,
  ContextPolicy,
  StructuredIntent,
} from '@rohinik-org/working-context'
import { DEFAULT_CONTEXT_POLICY } from '@rohinik-org/working-context'

// ─── ContextRanker ────────────────────────────────────────────────────────────

export class ContextRanker {
  scoreFragment(fragment: KnowledgeFragment, terms: readonly string[]): number {
    if (terms.length === 0) return 0
    const labels = fragment.nodes.map(n => n.label.toLowerCase())
    return terms.filter(t => labels.some(l => l.includes(t.toLowerCase()))).length / terms.length
  }

  scoreCapability(cap: InstalledCapability, terms: readonly string[]): number {
    if (terms.length === 0) return 0
    const text = `${cap.capabilityId} ${cap.manifest.name} ${cap.manifest.description} ${cap.manifest.tags.join(' ')}`.toLowerCase()
    return terms.filter(t => text.includes(t.toLowerCase())).length / terms.length
  }

  rankFragments(fragments: ReadonlyArray<KnowledgeFragment>, terms: readonly string[]): KnowledgeFragment[] {
    return [...fragments]
      .map(f => ({ f, score: this.scoreFragment(f, terms) }))
      .sort((a, b) => b.score - a.score)
      .map(({ f }) => f)
  }

  rankCapabilities(caps: ReadonlyArray<InstalledCapability>, terms: readonly string[]): InstalledCapability[] {
    return [...caps]
      .map(c => ({ c, score: this.scoreCapability(c, terms) }))
      .sort((a, b) => b.score - a.score)
      .map(({ c }) => c)
  }
}

// ─── ContextBuilder ───────────────────────────────────────────────────────────

export class ContextBuilder {
  private readonly ranker = new ContextRanker()

  build(
    intent: StructuredIntent,
    policy: ContextPolicy,
    knowledgeFragments: ReadonlyArray<KnowledgeFragment>,
    installedCapabilities: ReadonlyArray<InstalledCapability>,
  ): WorkingContextIR {
    const terms = [...intent.concepts, ...intent.preferredSkills]

    const ranked = this.ranker.rankFragments(knowledgeFragments, terms)
    const capped = ranked.slice(0, policy.budget.maxKnowledgeFragments)

    const rankedCaps = policy.includeCapabilities
      ? this.ranker.rankCapabilities(installedCapabilities, terms).slice(0, policy.budget.maxCapabilities)
      : []

    const contributors: string[] = []
    if (capped.length > 0) contributors.push('knowledge')
    if (rankedCaps.length > 0) contributors.push('capabilities')

    const confidence = terms.length === 0 ? 0 : Math.min(
      (capped.length / Math.max(policy.budget.maxKnowledgeFragments, 1)) * 0.5 +
      (rankedCaps.length / Math.max(policy.budget.maxCapabilities, 1)) * 0.5,
      1,
    )

    const contextId = createHash('sha256')
      .update(JSON.stringify({
        intentId: intent.intentId,
        fragmentCount: capped.length,
        capabilityCount: rankedCaps.length,
        policyId: policy.policyId,
      }))
      .digest('hex')

    return Object.freeze({
      contextId,
      requestId: randomUUID(),
      intent,
      memories: Object.freeze([] as unknown[]),
      knowledgeFragments: Object.freeze(capped),
      installedCapabilities: Object.freeze(rankedCaps),
      tokenBudget: policy.budget,
      confidence,
      assembledAt: new Date(),
      contributors: Object.freeze(contributors),
      policy,
    })
  }
}

// ─── ContextManager ───────────────────────────────────────────────────────────

export class ContextManager {
  private _knowledgeReg: { list(): ReadonlyArray<KnowledgeFragment> } | undefined
  private _capabilityReg: CapabilityRegistry | undefined
  private readonly builder = new ContextBuilder()

  withKnowledge(reg: { list(): ReadonlyArray<KnowledgeFragment> }): this {
    this._knowledgeReg = reg
    return this
  }

  withCapabilities(reg: CapabilityRegistry): this {
    this._capabilityReg = reg
    return this
  }

  async build(intent: StructuredIntent, policy: ContextPolicy = DEFAULT_CONTEXT_POLICY): Promise<WorkingContextIR> {
    const fragments = this._knowledgeReg?.list() ?? []
    const capabilities = this._capabilityReg?.list() ?? []
    return this.builder.build(intent, policy, fragments, capabilities)
  }
}
