import { describe, it, expect } from 'vitest'
import type { CapabilityDescriptorIR, CapabilityDefinition } from '../capability-descriptor-ir.js'
import type { RegistrationRecord } from '../registration-record.js'

describe('CapabilityDescriptorIR', () => {
  it('extends RuntimeArtifactBase — has provenance, not subject', () => {
    const ir: CapabilityDescriptorIR = {
      meta: { artifactId: 'cdir-1', schemaVersion: '1.0', kind: 'CapabilityDescriptorIR', createdAt: '2026-07-07T00:00:00Z', producer: 'mcp-adapter@1.0.0' },
      provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'install-session' },
      integrity: { checksum: 'sha256-x' },
      lifecycle: { state: 'ACTIVE' },
      origin: {
        protocol: 'mcp',
        adapterId: '@rohinik-org/mcp',
        adapterVersion: '1.0.0',
        protocolVersion: '2024-11-05',
        discoveryHash: 'sha256-discovery',
        capturedAt: '2026-07-07T00:00:00Z',
      },
      capabilities: [],
    }
    expect(ir.meta.kind).toBe('CapabilityDescriptorIR')
    expect('provenance' in ir).toBe(true)
    expect('subject' in ir).toBe(false)
  })

  it('CapabilityDefinition is protocol-neutral — no "tool" assumption', () => {
    const cap: CapabilityDefinition = {
      id: 'read_file',
      name: 'Read File',
      description: 'Reads a file from the local filesystem',
      tags: ['filesystem', 'read'],
      idempotent: true,
    }
    expect(cap.id).toBe('read_file')
    expect(cap.idempotent).toBe(true)
  })
})

describe('RegistrationRecord', () => {
  it('extends DiagnosticArtifactBase — has subject, not provenance', () => {
    const record: RegistrationRecord = {
      meta: { artifactId: 'rr-1', schemaVersion: '1.0', kind: 'RegistrationRecord', createdAt: '2026-07-07T00:00:00Z', producer: 'registration-pipeline@1.0.0' },
      integrity: { checksum: 'sha256-rr' },
      lifecycle: { state: 'ACTIVE' },
      subject: { kind: 'artifact-set', references: [{ kind: 'CapabilityDescriptorIR', id: 'cdir-1' }] },
      status: 'ADMITTED',
      compatibilityStatus: 'COMPATIBLE',
      complianceLevel: 1,
      registeredCapabilityIds: ['filesystem.read'],
    }
    expect(record.status).toBe('ADMITTED')
    expect('subject' in record).toBe(true)
    expect('provenance' in record).toBe(false)
  })
})
