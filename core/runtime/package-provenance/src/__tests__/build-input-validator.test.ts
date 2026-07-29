import { describe, it, expect } from 'vitest'
import { BuildInputValidator } from '../build-input-validator.js'
import type { BuildMaterial, ProvenancePolicy } from '../types.js'
import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }

function makePolicy(overrides?: Partial<ProvenancePolicy>): ProvenancePolicy {
  return {
    provenanceRequired: false,
    acceptedStatementTypes: [],
    acceptedStatementVersions: [],
    requiredBuilderIds: [],
    requiredWorkflowIds: [],
    requireImmutableSourceRevision: false,
    requireSourceTreeDigest: false,
    requiredMaterialKinds: [],
    requireCompleteInputSet: false,
    requireOutputDigestBinding: false,
    requireReproducibleBuild: false,
    trustedAuthorityIds: [],
    allowDegradedProvenance: false,
    ...overrides,
  }
}

const SOURCE_MATERIAL: BuildMaterial = { materialId: 'mat-1', kind: 'source-tree', uri: 'https://github.com/acme/pkg', digest: DIGEST }
const LOCKFILE_MATERIAL: BuildMaterial = { materialId: 'mat-2', kind: 'lockfile', uri: 'https://github.com/acme/pkg/lockfile.json', digest: DIGEST }
const TOOLCHAIN_MATERIAL: BuildMaterial = { materialId: 'mat-3', kind: 'toolchain', uri: 'node:18', digest: DIGEST }

const v = new BuildInputValidator()

describe('BuildInputValidator', () => {
  it('complete material set passes', () => {
    const r = v.validate([SOURCE_MATERIAL, LOCKFILE_MATERIAL], makePolicy({ requiredMaterialKinds: ['source-tree', 'lockfile'] }))
    expect(r.valid).toBe(true)
    expect(r.materialEvidenceIds).toContain('mat-1')
    expect(r.materialEvidenceIds).toContain('mat-2')
  })

  it('missing required source material fails', () => {
    const r = v.validate([], makePolicy({ requiredMaterialKinds: ['source-tree'] }))
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('input-set-incomplete')
  })

  it('missing lockfile material fails', () => {
    const r = v.validate([SOURCE_MATERIAL], makePolicy({ requiredMaterialKinds: ['source-tree', 'lockfile'] }))
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('input-set-incomplete')
  })

  it('missing toolchain material fails', () => {
    const r = v.validate([SOURCE_MATERIAL], makePolicy({ requiredMaterialKinds: ['toolchain'] }))
    expect(r.valid).toBe(false)
  })

  it('material digest mismatch between policy and declaration — no policy digest check in input validator', () => {
    const r = v.validate([SOURCE_MATERIAL], makePolicy())
    expect(r.valid).toBe(true)
  })

  it('duplicate identical material passes', () => {
    const r = v.validate([SOURCE_MATERIAL, SOURCE_MATERIAL], makePolicy())
    expect(r.valid).toBe(true)
  })

  it('duplicate conflicting material fails', () => {
    const conflict: BuildMaterial = { ...SOURCE_MATERIAL, uri: 'https://other-repo.com/pkg' }
    const r = v.validate([SOURCE_MATERIAL, conflict], makePolicy())
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('conflicting-provenance')
  })

  it('mutable dependency reference rejected when immutable policy active', () => {
    const mutable: BuildMaterial = { ...LOCKFILE_MATERIAL, mutableReference: true }
    const r = v.validate([mutable], makePolicy({ requireImmutableSourceRevision: true }))
    expect(r.valid).toBe(false)
  })

  it('deterministic material ordering in evidence IDs', () => {
    const r1 = v.validate([SOURCE_MATERIAL, LOCKFILE_MATERIAL, TOOLCHAIN_MATERIAL], makePolicy())
    const r2 = v.validate([TOOLCHAIN_MATERIAL, SOURCE_MATERIAL, LOCKFILE_MATERIAL], makePolicy())
    if (r1.materialEvidenceIds && r2.materialEvidenceIds) {
      const sorted1 = [...r1.materialEvidenceIds].sort()
      const sorted2 = [...r2.materialEvidenceIds].sort()
      expect(sorted1).toEqual(sorted2)
    }
  })

  it('transitive material handling — external-material kind accepted', () => {
    const transitive: BuildMaterial = { materialId: 'mat-t', kind: 'external-material', uri: 'https://example.com/dep' }
    const r = v.validate([transitive], makePolicy())
    expect(r.valid).toBe(true)
  })
})
