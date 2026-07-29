import { describe, it, expect } from 'vitest'
import { SignerPublisherBindingValidator } from '../signer-publisher-binding-validator.js'
import type { SignatureAssessment } from '@rohinik-org/package-trust-ir'
import type { PublisherIdentity, BindingEvidence } from '../types.js'

const PUBLISHER: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'acme' }
const SIGNER_ID = 'signer-001'
const KEY_ID = 'aabbccddeeff0011'

function goodSig(issuerId = SIGNER_ID, keyId?: string): SignatureAssessment {
  return keyId !== undefined ? { passed: true, issuerId, keyId } : { passed: true, issuerId }
}
function badSig(): SignatureAssessment {
  return { passed: false, reason: 'invalid-signature' }
}

const EXACT_BINDING: BindingEvidence = { bindingKind: 'exact-signer', signerId: SIGNER_ID, publisherIdentity: PUBLISHER }
const KEY_BINDING: BindingEvidence = { bindingKind: 'registered-key', keyFingerprint: KEY_ID, publisherIdentity: PUBLISHER }
const CERT_BINDING: BindingEvidence = { bindingKind: 'certificate-san', issuerId: SIGNER_ID, subjectKeyId: 'SKI-001', publisherIdentity: PUBLISHER }
const DELEG_BINDING: BindingEvidence = { bindingKind: 'delegation', delegationChain: [SIGNER_ID, 'intermediate', 'anchor'], publisherIdentity: PUBLISHER }

const v = new SignerPublisherBindingValidator()

describe('SignerPublisherBindingValidator', () => {
  it('exact signer binding succeeds', () => {
    const r = v.validate(goodSig(), PUBLISHER, [EXACT_BINDING])
    expect(r.valid).toBe(true)
    if (r.valid) expect(r.signerId).toBe(SIGNER_ID)
  })

  it('registered key fingerprint binding succeeds', () => {
    const r = v.validate(goodSig(SIGNER_ID, KEY_ID), PUBLISHER, [KEY_BINDING])
    expect(r.valid).toBe(true)
  })

  it('certificate identity binding succeeds', () => {
    const r = v.validate(goodSig(SIGNER_ID), PUBLISHER, [CERT_BINDING])
    expect(r.valid).toBe(true)
  })

  it('explicit delegation binding succeeds', () => {
    const r = v.validate(goodSig(SIGNER_ID), PUBLISHER, [DELEG_BINDING])
    expect(r.valid).toBe(true)
  })

  it('missing binding fails', () => {
    const r = v.validate(goodSig(), PUBLISHER, [])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('wrong-signer')
  })

  it('wrong signer fails', () => {
    const r = v.validate(goodSig('other-signer'), PUBLISHER, [EXACT_BINDING])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('wrong-signer')
  })

  it('delegation cycle fails', () => {
    const cycleBinding: BindingEvidence = { bindingKind: 'delegation', delegationChain: [SIGNER_ID, 'a', SIGNER_ID], publisherIdentity: PUBLISHER }
    const r = v.validate(goodSig(), PUBLISHER, [cycleBinding])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('delegation-cycle')
  })

  it('delegation depth exceeded fails', () => {
    const longChain: string[] = Array.from({ length: 10 }, (_, i) => `node-${i}`)
    const deepBinding: BindingEvidence = { bindingKind: 'delegation', delegationChain: [SIGNER_ID, ...longChain], publisherIdentity: PUBLISHER }
    const r = v.validate(goodSig(), PUBLISHER, [deepBinding])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('depth-exceeded')
  })

  it('ambiguous binding fails', () => {
    const r = v.validate(goodSig(), PUBLISHER, [EXACT_BINDING, CERT_BINDING])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('ambiguous-binding')
  })

  it('package metadata alone cannot establish binding', () => {
    // No binding evidence supplied = wrong-signer
    const r = v.validate(goodSig(), PUBLISHER, [])
    expect(r.valid).toBe(false)
  })

  it('missing signature assessment fails with no-signature', () => {
    const r = v.validate(badSig(), PUBLISHER, [EXACT_BINDING])
    expect(r.valid).toBe(false)
    if (!r.valid) expect(r.reason).toBe('no-signature')
  })
})
