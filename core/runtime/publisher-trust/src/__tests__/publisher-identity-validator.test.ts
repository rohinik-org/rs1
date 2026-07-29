import { describe, it, expect } from 'vitest'
import { PublisherIdentityValidator } from '../publisher-identity-validator.js'
import type { PublisherIdentity } from '../types.js'

describe('PublisherIdentityValidator', () => {
  const v = new PublisherIdentityValidator()

  it('valid registry-publisher identity', () => {
    const id: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'registry.npmjs.org', publisherId: 'lodash-org' }
    expect(v.validate(id).valid).toBe(true)
  })

  it('valid organization identity', () => {
    const id: PublisherIdentity = { identityKind: 'organization', authorityNamespace: 'rohinik-org', organizationId: 'acme-corp' }
    expect(v.validate(id).valid).toBe(true)
  })

  it('valid signing-key identity', () => {
    const id: PublisherIdentity = { identityKind: 'signing-key', algorithm: 'ed25519', keyFingerprint: 'aabbccddeeff0011' }
    expect(v.validate(id).valid).toBe(true)
  })

  it('valid certificate-subject identity', () => {
    const id: PublisherIdentity = { identityKind: 'certificate-subject', issuerId: 'ca.example.com', subjectKeyId: 'SKI-001' }
    expect(v.validate(id).valid).toBe(true)
  })

  it('blank publisher ID fails', () => {
    const id: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: '' }
    const r = v.validate(id)
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('blank-id')
  })

  it('blank registryId fails', () => {
    const id: PublisherIdentity = { identityKind: 'registry-publisher', registryId: '', publisherId: 'my-pkg' }
    const r = v.validate(id)
    expect(r.valid).toBe(false)
  })

  it('malformed namespace — spaces in publisherId', () => {
    const id: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'my pkg' }
    const r = v.validate(id)
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('malformed-namespace')
  })

  it('missing required field — blank organizationId', () => {
    const id: PublisherIdentity = { identityKind: 'organization', authorityNamespace: 'ns', organizationId: '' }
    const r = v.validate(id)
    expect(r.valid).toBe(false)
  })

  it('missing required field — blank algorithm', () => {
    const id: PublisherIdentity = { identityKind: 'signing-key', algorithm: '', keyFingerprint: 'aabbccddeeff0011' }
    const r = v.validate(id)
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('missing-required-field')
  })

  it('display name is irrelevant to identity equality', () => {
    const a: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'my-org' }
    const b: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'my-org' }
    expect(v.equals(a, b)).toBe(true)
  })

  it('cross-kind identity mismatch', () => {
    const a: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'org' }
    const b: PublisherIdentity = { identityKind: 'organization', authorityNamespace: 'r.example.com', organizationId: 'org' }
    expect(v.equals(a, b)).toBe(false)
  })

  it('signing-key fingerprint comparison is case-insensitive', () => {
    const a: PublisherIdentity = { identityKind: 'signing-key', algorithm: 'ed25519', keyFingerprint: 'AABBCC1122' }
    const b: PublisherIdentity = { identityKind: 'signing-key', algorithm: 'ed25519', keyFingerprint: 'aabbcc1122' }
    expect(v.equals(a, b)).toBe(true)
  })
})
