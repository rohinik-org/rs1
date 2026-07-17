import type { MemoryCandidate, MemoryPolicyConfig } from '@rohinik-org/compiler'

export class MemoryPolicy {
  constructor(private readonly config: MemoryPolicyConfig) {}

  gate(candidate: MemoryCandidate): boolean {
    if (candidate.kind === 'EPISODIC') return this.config.episodicEnabled
    if (candidate.kind === 'SEMANTIC') {
      if (!this.config.semanticEnabled) return false
      if (candidate.confidence < this.config.minConfidenceForSemantic) return false
      return !this._isSensitive(candidate)
    }
    if (candidate.kind === 'PROCEDURAL') {
      if (!this.config.proceduralEnabled) return false
      return candidate.confidence >= this.config.minConfidenceForProcedural
    }
    return false
  }

  computeExpiresAt(): string | undefined {
    if (this.config.defaultTtlDays === undefined) return undefined
    const d = new Date()
    d.setDate(d.getDate() + this.config.defaultTtlDays)
    return d.toISOString()
  }

  private _isSensitive(candidate: MemoryCandidate): boolean {
    if (!this.config.sensitiveConceptPatterns.length) return false
    const haystack = JSON.stringify(candidate.evidence).toLowerCase()
    return this.config.sensitiveConceptPatterns.some(p => haystack.includes(p.toLowerCase()))
  }
}
