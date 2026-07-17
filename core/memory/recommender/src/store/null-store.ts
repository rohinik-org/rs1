import type { RecommendationResult } from '@rohinik-org/compiler'

export class NullRecommendationStore {
  async save(_result: RecommendationResult): Promise<void> { /* no-op */ }
  async load(_id: string): Promise<RecommendationResult | null> { return null }
}
