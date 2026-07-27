import { describe, it, expect } from 'vitest'
import { deriveCandidateId, deriveGraphId, derivePlanId, deriveNodeId } from '../candidate-id.js'
import type { CatalogSnapshotHash, PackageId, CapabilityId, ResolutionGraphSemanticHash, ResolutionPlanSemanticHash } from '@rohinik-org/resolution-graph-ir'

const baseParams = {
  catalogSnapshotHash: 'snap-abc' as CatalogSnapshotHash,
  providerId: 'provider:fs',
  packageId: 'pkg:rohinik-fs' as PackageId,
  packageVersion: '1.0.0',
  capabilityId: 'cap:fs:read' as CapabilityId,
  capabilityVersion: '1.0.0',
  sourceId: 'org-catalog',
  artifactId: 'rohinik-fs-1.0.0',
}

describe('deriveCandidateId', () => {
  it('same inputs produce same candidateId (determinism)', () => {
    const id1 = deriveCandidateId(baseParams)
    const id2 = deriveCandidateId(baseParams)
    expect(id1).toBe(id2)
  })

  it('output is 64-char lowercase hex string', () => {
    const id = deriveCandidateId(baseParams)
    expect(id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different catalogSnapshotHash produces different candidateId', () => {
    const id1 = deriveCandidateId(baseParams)
    const id2 = deriveCandidateId({ ...baseParams, catalogSnapshotHash: 'snap-xyz' as CatalogSnapshotHash })
    expect(id1).not.toBe(id2)
  })

  it('different providerId produces different candidateId', () => {
    const id1 = deriveCandidateId(baseParams)
    const id2 = deriveCandidateId({ ...baseParams, providerId: 'provider:fs-v2' })
    expect(id1).not.toBe(id2)
  })

  it('different packageVersion produces different candidateId', () => {
    const id1 = deriveCandidateId(baseParams)
    const id2 = deriveCandidateId({ ...baseParams, packageVersion: '2.0.0' })
    expect(id1).not.toBe(id2)
  })
})

describe('deriveGraphId', () => {
  it('derives deterministic graphId from semanticHash', () => {
    const hash = 'abcdef1234567890' as ResolutionGraphSemanticHash
    expect(deriveGraphId(hash)).toBe(`rg-abcdef1234567890`)
  })
})

describe('derivePlanId', () => {
  it('derives deterministic planId from semanticHash', () => {
    const hash = 'abcdef1234567890' as ResolutionPlanSemanticHash
    expect(derivePlanId(hash)).toBe(`rp-abcdef1234567890`)
  })
})

describe('deriveNodeId', () => {
  it('same inputs produce same nodeId', () => {
    const a = deriveNodeId('req', 'cap:fs:read|1.0.0')
    const b = deriveNodeId('req', 'cap:fs:read|1.0.0')
    expect(a).toBe(b)
  })

  it('different prefixes produce different nodeIds', () => {
    const a = deriveNodeId('req', 'cap:fs:read|1.0.0')
    const b = deriveNodeId('cand', 'cap:fs:read|1.0.0')
    expect(a).not.toBe(b)
  })
})
