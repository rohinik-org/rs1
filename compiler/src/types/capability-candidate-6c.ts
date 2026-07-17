export interface CapabilityCandidate {
  readonly kind: 'CapabilityCandidate'
  readonly candidateId: string
  readonly queryId: string
  readonly sourceId: string
  readonly name: string
  readonly description: string
  readonly tags: readonly string[]
  readonly installSource: { readonly scheme: string; readonly location: string }
  readonly confidence: number
  readonly producedAt: string
}

export interface CapabilityCandidateSet {
  readonly kind: 'CapabilityCandidateSet'
  readonly setId: string
  readonly queryId: string
  readonly triggerId: string
  readonly candidates: readonly CapabilityCandidate[]
  readonly producedAt: string
}
