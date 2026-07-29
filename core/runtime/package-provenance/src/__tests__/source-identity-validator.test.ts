import { describe, it, expect } from 'vitest'
import { SourceIdentityValidator } from '../source-identity-validator.js'
import type { ProvenanceSourceIdentity, ProvenancePolicy } from '../types.js'

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

const NOW = new Date().toISOString()

const BASE_SOURCE: ProvenanceSourceIdentity = {
  authority: 'github.com',
  organization: 'acme',
  repository: 'acme/pkg',
  revision: { kind: 'commit-sha', value: 'a'.repeat(40) },
}

const v = new SourceIdentityValidator()

describe('SourceIdentityValidator', () => {
  it('approved source authority passes', () => {
    const r = v.validate(BASE_SOURCE, makePolicy(), NOW)
    expect(r.valid).toBe(true)
  })

  it('approved repository with commit sha passes', () => {
    const r = v.validate(BASE_SOURCE, makePolicy(), NOW)
    expect(r.valid).toBe(true)
    expect(r.sourceRevision).toContain('commit-sha')
  })

  it('wrong repository still passes without policy restriction', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, repository: 'other/repo' }
    const r = v.validate(src, makePolicy(), NOW)
    expect(r.valid).toBe(true)
  })

  it('missing immutable revision fails when policy requires', () => {
    const r = v.validate(undefined, makePolicy({ requireImmutableSourceRevision: true }), NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('source-revision-missing')
  })

  it('branch-only reference rejected when policy requires immutability', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, revision: { kind: 'branch', value: 'main' } }
    const r = v.validate(src, makePolicy({ requireImmutableSourceRevision: true }), NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('source-revision-invalid')
  })

  it('valid commit revision passes', () => {
    const r = v.validate(BASE_SOURCE, makePolicy({ requireImmutableSourceRevision: true }), NOW)
    expect(r.valid).toBe(true)
  })

  it('valid tree digest passes', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, revision: { kind: 'tree-digest', value: 'sha256:' + 'a'.repeat(64) } }
    const r = v.validate(src, makePolicy({ requireImmutableSourceRevision: true }), NOW)
    expect(r.valid).toBe(true)
  })

  it('malformed revision (short commit sha) fails', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, revision: { kind: 'commit-sha', value: 'abc123' } }
    const r = v.validate(src, makePolicy(), NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('source-revision-invalid')
  })

  it('missing authority fails', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, authority: '' }
    const r = v.validate(src, makePolicy(), NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('source-identity-mismatch')
  })

  it('source subpath validated when present', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, subpath: 'packages/core' }
    const r = v.validate(src, makePolicy(), NOW)
    expect(r.valid).toBe(true)
  })

  it('mutable tag not rejected without immutable policy', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, revision: { kind: 'tag', value: 'v1.0.0' } }
    const r = v.validate(src, makePolicy(), NOW)
    expect(r.valid).toBe(true)
  })

  it('mutable tag rejected when policy requires immutability', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, revision: { kind: 'tag', value: 'v1.0.0' } }
    const r = v.validate(src, makePolicy({ requireImmutableSourceRevision: true }), NOW)
    expect(r.valid).toBe(false)
  })

  it('unknown revision kind fails', () => {
    const src: ProvenanceSourceIdentity = { ...BASE_SOURCE, revision: { kind: 'unknown', value: 'something' } }
    const r = v.validate(src, makePolicy(), NOW)
    expect(r.valid).toBe(false)
    expect(r.reason).toBe('source-revision-invalid')
  })
})
