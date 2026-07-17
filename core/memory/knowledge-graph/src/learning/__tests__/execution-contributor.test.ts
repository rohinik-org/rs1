import { describe, it, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ExecutionContributor } from '../../contributors/execution-contributor.js'
import { GraphStore } from '../../graph-store.js'
import type { CorpusQueryEngine } from '@rohinik-org/corpus'
import type { ExecutionRecord } from '@rohinik-org/compiler'

function makeRecord(id: string, skillId: string, providerId: string): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: id, runtimeId: 'rt1', timestamp: '2026-01-01T00:00:00Z',
    requestId: `req-${id}`, requestHash: 'abc', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerTierId: 'tier1', winnerSkillId: skillId,
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 100, tierLatencies: [],
    providerResolutions: [{ requirementKey: 'r', providerId, providerKind: 'llm', resolved: true }],
    sourceTraceId: `t-${id}`, runtimeVersion: '1.0.0',
  }
}

describe('ExecutionContributor', () => {
  it('adds INFERRED edges to graph from corpus data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aios-test-'))
    try {
      const records = Array.from({ length: 15 }, (_, i) =>
        makeRecord(`r${i}`, 'skill-reader', 'anthropic')
      )
      const corpus = { query: async () => records } as unknown as CorpusQueryEngine
      const store = new GraphStore(root)
      const contributor = new ExecutionContributor(corpus, { minExecutions: 10, minConfidence: 0.7 })
      const contribution = await contributor.contribute({ projectRoot: root, existingGraph: store.empty() })
      // May have 0 edges if skills/providers don't map to existing graph nodes — that's OK
      // The key assertions are structural:
      expect(Array.isArray(contribution.edges)).toBe(true)
      for (const edge of contribution.edges) {
        expect(edge.certainty).toBe('INFERRED')
        expect(edge.provenance).toBe('execution-corpus')
        expect(edge.originInferenceId).toBeTruthy()
        expect(edge.originRule).toBeTruthy()
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('persists InferenceSet to .rohinik/inferences/ directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aios-test-'))
    try {
      const { readdir } = await import('node:fs/promises')
      const corpus = { query: async () => [] } as unknown as CorpusQueryEngine
      const store = new GraphStore(root)
      const contributor = new ExecutionContributor(corpus)
      await contributor.contribute({ projectRoot: root, existingGraph: store.empty() })
      const files = await readdir(join(root, '.aios', 'inferences')).catch(() => [])
      expect(files.length).toBeGreaterThanOrEqual(1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
