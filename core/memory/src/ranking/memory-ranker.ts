import type { MemoryArtifact, MemoryQuery, MemoryResult } from '@rohinik-org/compiler'

const NOW_MS = Date.now()
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

export class MemoryRanker {
  rank(artifacts: MemoryArtifact[], query: MemoryQuery): MemoryResult[] {
    const scored = artifacts.map(artifact => {
      const content = artifact.content as Record<string, unknown>
      const recency = _recencyScore(content.recordedAt as string | undefined ?? artifact.consolidatedAt)
      const successRate = content.outcome === 'SUCCESS' ? 1.0 : content.outcome === 'FAILED' ? 0.0 : 0.5
      const conceptOverlap = _conceptOverlap(content.concepts as string[] | undefined ?? [], [...(query.concepts ?? [])])
      const relevanceScore = Math.min(1, Math.max(0,
        0.4 * recency + 0.3 * artifact.importanceScore + 0.2 * successRate + 0.1 * conceptOverlap,
      ))
      const explanation = `outcome=${content.outcome ?? '?'}, recency=${recency.toFixed(2)}, importance=${artifact.importanceScore.toFixed(2)}`
      return { artifact, relevanceScore, explanation } satisfies MemoryResult
    })
    return scored.sort((a, b) => b.relevanceScore - a.relevanceScore)
  }
}

function _recencyScore(iso: string): number {
  const age = NOW_MS - new Date(iso).getTime()
  return Math.max(0, 1 - age / YEAR_MS)
}

function _conceptOverlap(artifactConcepts: string[], queryConcepts: string[]): number {
  if (!queryConcepts.length) return 0
  const matches = queryConcepts.filter(c => artifactConcepts.includes(c)).length
  return matches / queryConcepts.length
}
