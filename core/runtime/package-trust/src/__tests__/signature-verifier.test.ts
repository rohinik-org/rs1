import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import canonicalize from 'canonical-json'
import { SignatureVerifier } from '../signature-verifier.js'
import type {
  PackageTrustSubject,
  PackageSignatureEnvelope,
  PackageTrustPolicySnapshot,
  TrustRootSnapshot,
} from '@rohinik-org/package-trust-ir'
import { hashPackageTrustSubject } from '../subject-hash.js'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const PUBLIC_KEY_SPKI = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
}

function makePolicy(required = false): PackageTrustPolicySnapshot {
  return {
    policyId: 'p1', policyVersion: '1', semanticHash: 'ph',
    sourceRules: [], publisherRules: [],
    signatureRules: [{ order: 1, required }],
    provenanceRules: [], permissionRules: [], vulnerabilityRules: [],
    unknownSourceDecision: 'deny', unknownPublisherDecision: 'deny', missingRevocationDataDecision: 'deny',
  }
}

function makeTrustRoot(): TrustRootSnapshot {
  return {
    snapshotId: 'tr1', semanticHash: 'trh', createdAt: '2026-07-01T00:00:00.000Z',
    issuers: [{ issuerId: 'acme', keyId: 'key-1', algorithm: 'ed25519', publicKeyReference: PUBLIC_KEY_SPKI, status: 'active' }],
    namespaceBindings: [],
  }
}

function makeEnvelope(subject: PackageTrustSubject): PackageSignatureEnvelope {
  const stmt = {
    subjectSemanticHash: hashPackageTrustSubject(subject),
    artifactIntegrity: subject.expectedIntegrity,
  }
  const payload = {
    signatureVersion: '1',
    algorithm: 'ed25519' as const,
    issuerId: 'acme',
    keyId: 'key-1',
    signedAt: '2026-07-01T00:00:00.000Z',
    signedStatement: stmt,
  }
  const signedBytes = Buffer.from(canonicalize(payload))
  const sig = cryptoSign(undefined, signedBytes, privateKey).toString('base64')
  return { ...payload, signature: sig }
}

const verifier = new SignatureVerifier()

describe('SignatureVerifier', () => {
  it('passes with valid signature', async () => {
    const result = await verifier.verify(SUBJECT, makeEnvelope(SUBJECT), makePolicy(true), makeTrustRoot(), '2026-07-01T12:00:00.000Z')
    expect(result.passed).toBe(true)
    expect(result.issuerId).toBe('acme')
  })

  it('fails when signature required but absent', async () => {
    const result = await verifier.verify(SUBJECT, undefined, makePolicy(true), makeTrustRoot(), '2026-07-01T12:00:00.000Z')
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('signature-required')
  })

  it('passes when signature absent and not required', async () => {
    const result = await verifier.verify(SUBJECT, undefined, makePolicy(false), makeTrustRoot(), '2026-07-01T12:00:00.000Z')
    expect(result.passed).toBe(true)
  })

  it('fails when envelope issuer not in trust root', async () => {
    const env = { ...makeEnvelope(SUBJECT), issuerId: 'unknown-issuer' }
    const result = await verifier.verify(SUBJECT, env, makePolicy(true), makeTrustRoot(), '2026-07-01T12:00:00.000Z')
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('issuer-not-in-trust-root')
  })

  it('fails when statement subject hash mismatches', async () => {
    const env = makeEnvelope(SUBJECT)
    const differentSubject: PackageTrustSubject = { ...SUBJECT, version: '5.0.0', expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) } }
    const result = await verifier.verify(differentSubject, env, makePolicy(true), makeTrustRoot(), '2026-07-01T12:00:00.000Z')
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('statement-subject-hash-mismatch')
  })

  it('still validates present envelope even when signatures are optional', async () => {
    const badEnv = { ...makeEnvelope(SUBJECT), issuerId: 'unknown-issuer' }
    const result = await verifier.verify(SUBJECT, badEnv, makePolicy(false), makeTrustRoot(), '2026-07-01T12:00:00.000Z')
    expect(result.passed).toBe(false)
  })
})
