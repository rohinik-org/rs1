import { describe, it, expect } from 'vitest'
import type { RuntimeArtifactBase, ArtifactBase } from '../artifact.js'
import type { DiagnosticArtifactBase } from '../diagnostic-artifact.js'

describe('RuntimeArtifactBase / ArtifactBase alias', () => {
  it('RuntimeArtifactBase has provenance', () => {
    const artifact: RuntimeArtifactBase = {
      meta: { artifactId: 'r1', schemaVersion: '1.0', kind: 'IntentIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
      provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
      integrity: { checksum: 'sha256-r' },
      lifecycle: { state: 'ACTIVE' },
    }
    expect(artifact.provenance.sessionId).toBe('sess-1')
  })

  it('ArtifactBase is backward-compatible alias for RuntimeArtifactBase', () => {
    const artifact: ArtifactBase = {
      meta: { artifactId: 'r2', schemaVersion: '1.0', kind: 'PlanIR', createdAt: '2026-07-07T00:00:00Z', producer: 'test' },
      provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
      integrity: { checksum: 'sha256-r2' },
      lifecycle: { state: 'ACTIVE' },
    }
    expect(artifact.meta.kind).toBe('PlanIR')
  })
})

describe('DiagnosticArtifactBase', () => {
  it('has subject instead of provenance', () => {
    const report: DiagnosticArtifactBase = {
      meta: { artifactId: 'c1', schemaVersion: '1.0', kind: 'ComplianceReport', createdAt: '2026-07-07T00:00:00Z', producer: 'benchmark-runner' },
      integrity: { checksum: 'sha256-c' },
      lifecycle: { state: 'ACTIVE' },
      subject: {
        kind: 'benchmark-run',
        references: [{ kind: 'BenchmarkRun', id: 'run-123' }],
      },
    }
    expect(report.subject.kind).toBe('benchmark-run')
    expect('provenance' in report).toBe(false)
  })

  it('subject can reference multiple artifacts', () => {
    const report: DiagnosticArtifactBase = {
      meta: { artifactId: 'c2', schemaVersion: '1.0', kind: 'PluginComplianceReport', createdAt: '2026-07-07T00:00:00Z', producer: 'benchmark-runner' },
      integrity: { checksum: 'sha256-c2' },
      lifecycle: { state: 'ACTIVE' },
      subject: {
        kind: 'artifact-set',
        references: [
          { kind: 'ExecutionReport', id: 'exec-1' },
          { kind: 'VerificationReport', id: 'verify-1' },
        ],
      },
    }
    expect(report.subject.references).toHaveLength(2)
  })
})
