import type { MemoryArtifact, MemoryQuery } from '@rohinik-org/compiler'
import type { MemoryStore } from './memory-store.js'

export class NullMemoryStore implements MemoryStore {
  private readonly artifacts = new Map<string, MemoryArtifact>()

  async saveArtifact(artifact: MemoryArtifact): Promise<void> {
    this.artifacts.set(artifact.artifactId, artifact)
  }

  async findRelevant(query: MemoryQuery): Promise<MemoryArtifact[]> {
    let results = [...this.artifacts.values()]
    if (query.kinds?.length) {
      results = results.filter(a => query.kinds!.includes(a.artifactKind))
    }
    if (query.minImportance !== undefined) {
      results = results.filter(a => a.importanceScore >= query.minImportance!)
    }
    if (query.limit !== undefined) {
      results = results.slice(0, query.limit)
    }
    return results
  }

  async getAll(): Promise<MemoryArtifact[]> {
    return [...this.artifacts.values()]
  }

  async removeById(artifactId: string): Promise<boolean> {
    return this.artifacts.delete(artifactId)
  }
}
