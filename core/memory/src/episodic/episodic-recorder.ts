import { createHash } from 'node:crypto'
import type { ExecutionResult, MemoryEpisode } from '@rohinik-org/compiler'
import type { MemoryStore } from '../store/memory-store.js'

export class EpisodicRecorder {
  constructor(private readonly store: MemoryStore) {}

  async record(result: ExecutionResult): Promise<MemoryEpisode> {
    const episodeId = createHash('sha256').update(result.executionId).digest('hex')
    const skillsUsed = result.stepRecords.map(s => s.skillId)
    const providersUsed = [...new Set(result.stepRecords.map(s => s.providerUsed).filter(Boolean) as string[])]
    const outcome = _mapOutcome(result.termination.reason)

    const episode: MemoryEpisode = {
      kind: 'MemoryEpisode',
      episodeId,
      executionId: result.executionId,
      planId: result.planId,
      ...(result.metadata.workflowId !== undefined && { workflowId: result.metadata.workflowId }),
      rawInput: '',
      concepts: [],
      skillsUsed,
      outcome,
      durationMs: result.metrics.totalDurationMs,
      estimatedCostUsd: result.metrics.estimatedCostUsd,
      retryCount: result.metrics.retryCount,
      providersUsed,
      recordedAt: new Date().toISOString(),
      importanceScore: 1.0,
    }

    // ponytail: save as artifact stub; full artifact pipeline runs in consolidation
    await this.store.saveArtifact({
      kind: 'MemoryArtifact',
      artifactId: episodeId,
      artifactKind: 'EPISODE',
      candidateId: episodeId,
      content: episode as unknown as Record<string, unknown>,
      importanceScore: 1.0,
      consolidatedAt: episode.recordedAt,
    })

    return episode
  }
}

function _mapOutcome(reason: string): 'SUCCESS' | 'FAILED' | 'CANCELLED' {
  if (reason === 'SUCCESS') return 'SUCCESS'
  if (reason === 'CANCELLED') return 'CANCELLED'
  return 'FAILED'
}
