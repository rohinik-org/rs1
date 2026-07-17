import { describe, it, expect } from 'vitest'
import { EntityResolver } from '../entity-resolver.js'
import type { IntentCandidate } from '../intent-candidate.js'
import type { CompilerContext } from '../../types/compiler-context.js'

function makeCtx(bindings: Record<string, unknown> = {}): CompilerContext {
  return {
    session: { sessionId: 'sess-1', bindings, activeArtifacts: [] },
    policy: { clarificationThreshold: 0.7, maxPlanSteps: 20, allowedTiers: [], verificationMode: 'strict' },
    system: {
      snapshotId: 'snap-1', capturedAt: '2026-07-07T00:00:00Z',
      runtime: { runtimeId: 'rt-1', protocolVersion: '1.0', features: { memory: false, streaming: false, reasoning: false } },
      capabilities: {
        meta: { artifactId: 'c', schemaVersion: '1.0', kind: 'CapabilitySnapshot', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
        provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
        integrity: { checksum: 'x' }, lifecycle: { state: 'ACTIVE' },
        snapshotId: 'cs', capturedAt: '2026-07-07T00:00:00Z', runtimeId: 'rt-1',
        source: 'GET /v1/capabilities', fingerprint: 'fp', skills: [],
      },
    },
  }
}

describe('EntityResolver', () => {
  it('resolves a path literal directly', () => {
    const candidate: IntentCandidate = { rawText: 'sort ~/Downloads', parsedEntities: [{ name: 'folder', rawValue: '~/Downloads', inferredType: 'directory' }] }
    const result = new EntityResolver().resolve(candidate, makeCtx())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entities[0]!.resolved).toBe('~/Downloads')
      expect(result.entities[0]!.source).toBe('literal')
    }
  })

  it('resolves an entity from BindingTable', () => {
    const candidate: IntentCandidate = { rawText: 'sort those', parsedEntities: [{ name: 'selectedFiles', rawValue: 'those' }] }
    const result = new EntityResolver().resolve(candidate, makeCtx({ selectedFiles: ['/tmp/a.txt'] }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.entities[0]!.source).toBe('binding')
      expect(result.entities[0]!.resolved).toEqual(['/tmp/a.txt'])
    }
  })

  it('emits ClarificationIR when entity cannot be resolved', () => {
    const candidate: IntentCandidate = { rawText: 'sort it', parsedEntities: [{ name: 'it', rawValue: '' }] }
    const result = new EntityResolver().resolve(candidate, makeCtx())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.clarification.reason.type).toBe('ambiguous_entity')
    }
  })
})
