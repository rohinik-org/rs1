export interface CapabilityQuery {
  readonly queryId: string
  readonly triggerId: string
  readonly searchTerms: readonly string[]
  readonly requiredTags?: readonly string[]
  readonly preferredSources?: readonly string[]
  readonly producedAt: string
}
