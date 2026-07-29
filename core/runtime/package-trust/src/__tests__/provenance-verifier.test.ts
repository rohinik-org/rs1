import { describe, it, expect } from 'vitest'
import { ProvenanceVerifier } from '../provenance-verifier.js'
import type {
  PackageTrustSubject,
  BuildProvenanceEnvelope,
  PackageTrustPolicySnapshot,
  TrustRootSnapshot,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
}

const OBSERVED: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }

function makePolicy(required = false): PackageTrustPolicySnapshot {
  return {
    policyId: 'p1', policyVersion: '1', semanticHash: 'ph',
    sourceRules: [], publisherRules: [], signatureRules: [],
    provenanceRules: [{ order: 1, required, acceptedBuilderIdentities: ['trusted-builder'] }],
    permissionRules: [], vulnerabilityRules: [],
    unknownSourceDecision: 'deny', unknownPublisherDecision: 'deny', missingRevocationDataDecision: 'deny',
  }
}

function makeTrustRoot(): TrustRootSnapshot {
  return {
    snapshotId: 'tr1', semanticHash: 'trh', createdAt: '2026-07-01T00:00:00.000Z',
    issuers: [{ issuerId: 'builder-issuer', keyId: 'bk-1', algorithm: 'ed25519', publicKeyReference: 'spki', status: 'active' }],
    namespaceBindings: [],
  }
}

function makeEnvelope(outputIntegrity = OBSERVED): BuildProvenanceEnvelope {
  return {
    provenanceVersion: '1',
    issuerId: 'builder-issuer',
    buildId: 'build-123',
    outputIntegrity,
    builderIdentity: 'trusted-builder',
    builtAt: '2026-07-01T00:00:00.000Z',
    signature: 'fake-sig',
  }
}

const verifier = new ProvenanceVerifier()

describe('ProvenanceVerifier', () => {
  it('passes with valid provenance matching observed integrity', async () => {
    const result = await verifier.verify(SUBJECT, OBSERVED, makeEnvelope(), makePolicy(true), makeTrustRoot())
    expect(result.passed).toBe(true)
    expect(result.builderIdentity).toBe('trusted-builder')
  })

  it('fails when provenance required but absent', async () => {
    const result = await verifier.verify(SUBJECT, OBSERVED, undefined, makePolicy(true), makeTrustRoot())
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('provenance-required')
  })

  it('passes when provenance absent and not required', async () => {
    const result = await verifier.verify(SUBJECT, OBSERVED, undefined, makePolicy(false), makeTrustRoot())
    expect(result.passed).toBe(true)
  })

  it('fails when issuer not in trust root', async () => {
    const env = { ...makeEnvelope(), issuerId: 'unknown-issuer' }
    const result = await verifier.verify(SUBJECT, OBSERVED, env, makePolicy(true), makeTrustRoot())
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('provenance-issuer-not-in-trust-root')
  })

  it('fails when outputIntegrity mismatches observed', async () => {
    const differentIntegrity: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) }
    const env = makeEnvelope(differentIntegrity)
    const result = await verifier.verify(SUBJECT, OBSERVED, env, makePolicy(true), makeTrustRoot())
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('provenance-output-integrity-mismatch')
  })
})
