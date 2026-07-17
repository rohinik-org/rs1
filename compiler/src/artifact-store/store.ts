import type { ArtifactBase } from '../types/artifact.js'

export interface ArtifactStore {
  put(artifact: ArtifactBase): Promise<void>
  get(artifactId: string): Promise<ArtifactBase | undefined>
  listByKind(kind: string): Promise<readonly ArtifactBase[]>
}

export class InMemoryArtifactStore implements ArtifactStore {
  private readonly store = new Map<string, ArtifactBase>()

  async put(artifact: ArtifactBase): Promise<void> {
    const id = artifact.meta.artifactId
    if (this.store.has(id)) {
      throw new Error(`Artifact ${id} already exists. Artifacts are immutable (Law 17).`)
    }
    this.store.set(id, artifact)
  }

  async get(artifactId: string): Promise<ArtifactBase | undefined> {
    return this.store.get(artifactId)
  }

  async listByKind(kind: string): Promise<readonly ArtifactBase[]> {
    return [...this.store.values()].filter(a => a.meta.kind === kind)
  }
}
