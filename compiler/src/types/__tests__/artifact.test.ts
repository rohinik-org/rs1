import { describe, it, expect } from 'vitest'
import type { ArtifactBase, ArtifactLifecycle } from '../artifact.js'

describe('ArtifactBase', () => {
  it('accepts a valid artifact', () => {
    const artifact: ArtifactBase = {
      meta: { artifactId: 'abc123', schemaVersion: '1.0', kind: 'IntentIR', createdAt: '2026-07-07T00:00:00Z', producer: '@rohinik-org/compiler@0.1.0' },
      provenance: { systemSnapshotId: 'snap123', parentArtifacts: [], sessionId: 'sess-1' },
      integrity: { checksum: 'sha256-abc' },
      lifecycle: { state: 'ACTIVE' },
    }
    expect(artifact.meta.kind).toBe('IntentIR')
    expect(artifact.lifecycle.state).toBe('ACTIVE')
  })

  it('allows supersedes in lifecycle', () => {
    const lifecycle: ArtifactLifecycle = { state: 'SUPERSEDED', supersedes: 'prior-artifact-id' }
    expect(lifecycle.supersedes).toBe('prior-artifact-id')
  })
})
