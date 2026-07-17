import type { MemoryArtifact, MemoryQuery } from '@rohinik-org/compiler'

export interface MemoryStore {
  saveArtifact(artifact: MemoryArtifact): Promise<void>
  findRelevant(query: MemoryQuery): Promise<MemoryArtifact[]>
  loadCheckpoint?(executionId: string): Promise<MemoryArtifact | undefined>
  getAll(): Promise<MemoryArtifact[]>
  removeById(artifactId: string): Promise<boolean>
}
