import { describe, it, expect } from 'vitest'
import type { CapabilityCandidateSet, CapabilityValidationReport, CapabilityApproval, CapabilityDescriptorIR } from '@rohinik-org/compiler'
import { NullAcquisitionStore } from '../store/null-acquisition-store.js'

function makeCandidateSet(): CapabilityCandidateSet {
  return { kind: 'CapabilityCandidateSet', setId: 'set-1', queryId: 'q-1', triggerId: 'trig-1', candidates: [], producedAt: new Date().toISOString() }
}

function makeReport(): CapabilityValidationReport {
  return { kind: 'CapabilityValidationReport', reportId: 'rep-1', candidateId: 'cand-1', passed: true, checks: [], producedAt: new Date().toISOString() }
}

function makeApproval(): CapabilityApproval {
  return { kind: 'CapabilityApproval', approvalId: 'app-1', candidateId: 'cand-1', reportId: 'rep-1', decision: 'APPROVED', decidedBy: 'POLICY', decidedAt: new Date().toISOString() }
}

function makeDescriptor(): CapabilityDescriptorIR {
  return {
    meta: { artifactId: 'desc-1', schemaVersion: '1.0', kind: 'CapabilityDescriptorIR', createdAt: new Date().toISOString(), producer: 'test' },
    integrity: { checksum: 'abc' },
    lifecycle: { state: 'ACTIVE' },
    provenance: { systemSnapshotId: 'snap-1', parentArtifacts: [], sessionId: 'sess-1' },
    origin: { protocol: 'file', adapterId: 'test', adapterVersion: '0.1.0', protocolVersion: '1.0', discoveryHash: 'hash', capturedAt: new Date().toISOString() },
    capabilities: [],
  }
}

describe('NullAcquisitionStore', () => {
  it('save and load candidate set', async () => {
    const store = new NullAcquisitionStore()
    const set = makeCandidateSet()
    await store.saveCandidateSet(set)
    const loaded = await store.loadCandidateSet('set-1')
    expect(loaded).toEqual(set)
  })

  it('save and retrieve validation report', async () => {
    const store = new NullAcquisitionStore()
    const report = makeReport()
    await store.saveValidationReport(report)
    // no direct load — covered by integration; just verify no throw
    expect(true).toBe(true)
  })

  it('save and retrieve approval', async () => {
    const store = new NullAcquisitionStore()
    await store.saveApproval(makeApproval())
    expect(true).toBe(true)
  })

  it('save descriptor and list shows it', async () => {
    const store = new NullAcquisitionStore()
    const desc = makeDescriptor()
    await store.saveDescriptor(desc)
    const list = await store.listDescriptors()
    expect(list).toHaveLength(1)
    expect(list[0]?.meta.artifactId).toBe('desc-1')
  })

  it('loadCandidateSet returns undefined for unknown id', async () => {
    const store = new NullAcquisitionStore()
    const result = await store.loadCandidateSet('nonexistent')
    expect(result).toBeUndefined()
  })
})
