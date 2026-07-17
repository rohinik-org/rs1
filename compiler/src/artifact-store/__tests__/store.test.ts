import { describe, it, expect } from 'vitest'
import { InMemoryArtifactStore } from '../store.js'
import type { ArtifactBase } from '../../types/artifact.js'

function makeArtifact(id: string, kind: string): ArtifactBase {
  return {
    meta: { artifactId: id, schemaVersion: '1.0', kind, createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
    provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
    integrity: { checksum: `sha256-${id}` },
    lifecycle: { state: 'ACTIVE' },
  }
}

describe('InMemoryArtifactStore', () => {
  it('stores and retrieves an artifact by ID', async () => {
    const store = new InMemoryArtifactStore()
    const a = makeArtifact('a1', 'IntentIR')
    await store.put(a)
    const retrieved = await store.get('a1')
    expect(retrieved).toEqual(a)
  })

  it('returns undefined for unknown ID', async () => {
    const store = new InMemoryArtifactStore()
    expect(await store.get('unknown')).toBeUndefined()
  })

  it('throws when writing the same ID twice (immutability — Law 17)', async () => {
    const store = new InMemoryArtifactStore()
    const a = makeArtifact('dup', 'IntentIR')
    await store.put(a)
    await expect(store.put(a)).rejects.toThrow('Artifact dup already exists')
  })

  it('lists artifacts by kind', async () => {
    const store = new InMemoryArtifactStore()
    await store.put(makeArtifact('i1', 'IntentIR'))
    await store.put(makeArtifact('p1', 'PlanIR'))
    await store.put(makeArtifact('i2', 'IntentIR'))
    const intents = await store.listByKind('IntentIR')
    expect(intents).toHaveLength(2)
    expect(intents.map(a => a.meta.artifactId)).toContain('i1')
    expect(intents.map(a => a.meta.artifactId)).toContain('i2')
  })

  it('supersedes: new artifact with lifecycle.supersedes is stored alongside original', async () => {
    const store = new InMemoryArtifactStore()
    const original = makeArtifact('orig', 'IntentIR')
    const replacement = {
      ...makeArtifact('repl', 'IntentIR'),
      lifecycle: { state: 'ACTIVE' as const, supersedes: 'orig' },
    }
    await store.put(original)
    await store.put(replacement)
    expect(await store.get('orig')).toBeDefined()
    expect(await store.get('repl')).toBeDefined()
  })
})
