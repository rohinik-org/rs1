import { describe, it, expect } from 'vitest'
import { BuildOutputValidator } from '../build-output-validator.js'
import type { ProvenanceBuildOutput, ProvenancePolicy } from '../types.js'
import type { IntegrityDigest } from '@rohinik-org/package-trust-ir'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
const OTHER_DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) }
const SHA512: IntegrityDigest = { algorithm: 'sha512', encoding: 'hex', value: 'c'.repeat(128) }

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

const OUTPUT: ProvenanceBuildOutput = { outputId: 'out-1', packageId: 'pkg', version: '1.0.0', mediaType: 'application/tar+gzip', digest: DIGEST }

const v = new BuildOutputValidator()

describe('BuildOutputValidator', () => {
  it('exact output digest match passes', () => {
    const r = v.validate([OUTPUT], DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.valid).toBe(true)
    expect(r.outputEvidenceIds).toContain('out-1')
  })

  it('output package ID match passes', () => {
    const r = v.validate([OUTPUT], DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.valid).toBe(true)
  })

  it('output version match passes', () => {
    const r = v.validate([OUTPUT], DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.valid).toBe(true)
  })

  it('digest mismatch fails', () => {
    const r = v.validate([OUTPUT], OTHER_DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('output-mismatch')
  })

  it('unsupported output type — no mediaType check, passes by digest', () => {
    const out: ProvenanceBuildOutput = { ...OUTPUT, mediaType: 'unknown/type' }
    const r = v.validate([out], DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.valid).toBe(true)
  })

  it('ambiguous multi-output statement fails without degraded policy', () => {
    const out2: ProvenanceBuildOutput = { outputId: 'out-2', packageId: 'pkg2', version: '1.0.0', digest: DIGEST }
    const r = v.validate([OUTPUT, out2], DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('ambiguous-provenance')
  })

  it('permitted multi-output statement with degraded policy passes', () => {
    const out2: ProvenanceBuildOutput = { outputId: 'out-2', packageId: 'pkg2', version: '1.0.0', digest: DIGEST }
    const r = v.validate([OUTPUT, out2], DIGEST, 'pkg', '1.0.0', makePolicy({ allowDegradedProvenance: true }))
    expect(r.valid).toBe(true)
  })

  it('source-only statement (no outputs) rejected when output binding required', () => {
    const r = v.validate([], DIGEST, 'pkg', '1.0.0', makePolicy({ requireOutputDigestBinding: true }))
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('output-mismatch')
  })

  it('no outputs without required binding passes', () => {
    const r = v.validate([], DIGEST, 'pkg', '1.0.0', makePolicy())
    expect(r.valid).toBe(true)
  })
})
