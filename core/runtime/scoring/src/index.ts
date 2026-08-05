import type { KnowledgeFragment } from '@rohinik-org/knowledge'
import type { InstalledCapability } from '@rohinik-org/capability-registry'

export type { KnowledgeFragment, InstalledCapability }

export class ContextRanker {
  scoreFragment(fragment: KnowledgeFragment, terms: readonly string[]): number {
    if (terms.length === 0) return 0
    const labels = fragment.nodes.map((n: { label: string }) => n.label.toLowerCase())
    return terms.filter(t => labels.some((l: string) => l.includes(t.toLowerCase()))).length / terms.length
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
