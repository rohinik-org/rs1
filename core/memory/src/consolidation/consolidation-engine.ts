import { randomUUID } from 'node:crypto'
import type { MemoryArtifact, MemoryArtifactKind, MemoryCandidateSet } from '@rohinik-org/compiler'
import type { MemoryPolicy } from '../policy/memory-policy.js'
import type { MemoryStore } from '../store/memory-store.js'

export class ConsolidationEngine {
  constructor(
    private readonly policy: MemoryPolicy,
    private readonly store: MemoryStore,
  ) {}

  async consolidate(candidateSet: MemoryCandidateSet): Promise<MemoryArtifact[]> {
    const artifacts: MemoryArtifact[] = []
    for (const candidate of candidateSet.candidates) {
      if (!this.policy.gate(candidate)) continue
      const expiresAt = this.policy.computeExpiresAt()
      const artifact: MemoryArtifact = {
        kind: 'MemoryArtifact',
        artifactId: randomUUID(),
        artifactKind: _kindToArtifactKind(candidate.kind),
        candidateId: candidate.candidateId,
        content: candidate.evidence,
        importanceScore: candidate.confidence,
        consolidatedAt: new Date().toISOString(),
        ...(expiresAt !== undefined && { expiresAt }),
      }
      await this.store.saveArtifact(artifact)
      artifacts.push(artifact)
    }
    return artifacts
  }
}

function _kindToArtifactKind(kind: string): MemoryArtifactKind {
  if (kind === 'SEMANTIC') return 'SEMANTIC_FACT'
  if (kind === 'PROCEDURAL') return 'PROCEDURE'
  return 'EPISODE'
}
