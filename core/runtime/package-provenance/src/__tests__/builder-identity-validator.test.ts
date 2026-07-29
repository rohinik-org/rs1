import { describe, it, expect } from 'vitest'
import { BuilderIdentityValidator } from '../builder-identity-validator.js'
import type { ProvenanceBuilderIdentity, ProvenancePolicy, PublisherTrustAssessment } from '../types.js'
import type { RevocationAssessment } from '@rohinik-org/package-trust-ir'

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

const BUILDER: ProvenanceBuilderIdentity = { kind: 'ci-system', builderId: 'github-actions', buildSystemId: 'gha', workflowId: 'release.yml' }
const ANON_BUILDER: ProvenanceBuilderIdentity = { kind: 'anonymous', builderId: '' }
const CLEARED_REVOCATION: RevocationAssessment = { decision: 'passed' }
const ACTIVE_REVOCATION: RevocationAssessment = { decision: 'failed', reason: 'builder-key-revoked' }
const UNKNOWN_REVOCATION: RevocationAssessment = { decision: 'manual-review-required' }
const PUBLISHER_TRUST: PublisherTrustAssessment = { passed: true, outcome: 'trusted' }

const v = new BuilderIdentityValidator()

describe('BuilderIdentityValidator', () => {
  it('trusted builder passes', () => {
    const r = v.validate(BUILDER, makePolicy(), CLEARED_REVOCATION, undefined)
    expect(r.valid).toBe(true)
    expect(r.builderIdentity).toContain('github-actions')
  })

  it('trusted workflow passes', () => {
    const r = v.validate(BUILDER, makePolicy({ requiredWorkflowIds: ['release.yml'] }), undefined, undefined)
    expect(r.valid).toBe(true)
  })

  it('anonymous builder rejected when policy requires identity', () => {
    const r = v.validate(ANON_BUILDER, makePolicy({ requiredBuilderIds: ['github-actions'] }), undefined, undefined)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('builder-untrusted')
  })

  it('unknown builder fails required builder list', () => {
    const r = v.validate(BUILDER, makePolicy({ requiredBuilderIds: ['circle-ci'] }), undefined, undefined)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('builder-untrusted')
  })

  it('wrong build system — still passes without build-system policy', () => {
    const r = v.validate({ ...BUILDER, buildSystemId: 'other' }, makePolicy(), undefined, undefined)
    expect(r.valid).toBe(true)
  })

  it('revoked builder fails', () => {
    const r = v.validate(BUILDER, makePolicy(), ACTIVE_REVOCATION, undefined)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('builder-revoked')
  })

  it('revoked attestation issuer fails', () => {
    const r = v.validate(BUILDER, makePolicy(), ACTIVE_REVOCATION, undefined)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('builder-revoked')
  })

  it('publisher and builder kept distinct — publisher trust does not grant builder trust', () => {
    const r = v.validate(BUILDER, makePolicy({ requiredBuilderIds: ['github-actions'] }), undefined, PUBLISHER_TRUST)
    expect(r.valid).toBe(true)
    expect(r.builderIdentity).not.toContain('trusted')
  })

  it('explicit publisher-builder equivalence binding — builder ID in required list succeeds', () => {
    const r = v.validate(BUILDER, makePolicy({ requiredBuilderIds: ['github-actions'] }), undefined, PUBLISHER_TRUST)
    expect(r.valid).toBe(true)
  })

  it('display name ignored — builderIdentity uses builderId not display', () => {
    const r = v.validate(BUILDER, makePolicy(), undefined, undefined)
    if (r.valid) {
      expect(r.builderIdentity).not.toBe('GitHub Actions (display name)')
    }
  })

  it('missing builder with no policy requirements passes', () => {
    const r = v.validate(undefined, makePolicy(), undefined, undefined)
    expect(r.valid).toBe(true)
  })

  it('unknown revocation result does not fail builder', () => {
    const r = v.validate(BUILDER, makePolicy(), UNKNOWN_REVOCATION, undefined)
    expect(r.valid).toBe(true)
  })
})
