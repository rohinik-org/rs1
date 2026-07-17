import type { ExecutionResult, MemoryArtifact, MemoryQuery, MemoryResult } from '@rohinik-org/compiler'
import { DEFAULT_MEMORY_POLICY } from '@rohinik-org/compiler'
import type { MemoryFacade } from './facade-types.js'
import type { MemoryStore } from '@rohinik-org/memory'
import { MemoryEngine, NullMemoryStore } from '@rohinik-org/memory'

export class DefaultMemoryFacade implements MemoryFacade {
  private readonly engine: MemoryEngine

  constructor(store: MemoryStore = new NullMemoryStore()) {
    this.engine = new MemoryEngine(store, DEFAULT_MEMORY_POLICY)
  }

  record(result: ExecutionResult): Promise<MemoryArtifact[]> {
    return this.engine.record(result)
  }

  recall(query: MemoryQuery): Promise<MemoryResult[]> {
    return this.engine.recall(query)
  }
}

export class NoopMemoryFacade implements MemoryFacade {
  record(_result: ExecutionResult): Promise<MemoryArtifact[]> { return Promise.resolve([]) }
  recall(_query: MemoryQuery): Promise<MemoryResult[]> { return Promise.resolve([]) }
}
