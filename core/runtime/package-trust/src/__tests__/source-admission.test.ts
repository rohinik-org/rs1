import { describe, it, expect } from 'vitest'
import { SourceAdmissionEvaluator } from '../source-admission.js'
import type { PackageTrustSubject, PackageTrustPolicySnapshot, TrustRootSnapshot } from '@rohinik-org/package-trust-ir'

function makeSubject(overrides: Partial<PackageTrustSubject> = {}): PackageTrustSubject {
  return {
    subjectKind: 'language-dependency',
    packageId: 'lodash',
    version: '4.17.21',
    sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
    expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
    ...overrides,
  }
}

function makePolicy(overrides: Partial<PackageTrustPolicySnapshot> = {}): PackageTrustPolicySnapshot {
  return {
    policyId: 'p1', policyVersion: '1', semanticHash: 'ph',
    sourceRules: [{ order: 1, sourceKind: 'npm-registry', effect: 'allow' }],
    publisherRules: [],
    signatureRules: [],
    provenanceRules: [],
    permissionRules: [],
    vulnerabilityRules: [],
    unknownSourceDecision: 'deny',
    unknownPublisherDecision: 'deny',
    missingRevocationDataDecision: 'deny',
    ...overrides,
  }
}

function makeTrustRoot(overrides: Partial<TrustRootSnapshot> = {}): TrustRootSnapshot {
  return {
    snapshotId: 'tr1', semanticHash: 'trh', createdAt: '2026-07-01T00:00:00.000Z',
    issuers: [{ issuerId: 'acme', keyId: 'key-1', algorithm: 'ed25519', publicKeyReference: 'spki-base64', status: 'active' }],
    namespaceBindings: [],
    ...overrides,
  }
}

const evaluator = new SourceAdmissionEvaluator()

describe('SourceAdmissionEvaluator.assess', () => {
  it('passes npm-registry with allow rule', () => {
    expect(evaluator.assess(makeSubject(), makePolicy()).passed).toBe(true)
  })

  it('denies unknown source', () => {
    const subject = makeSubject({ sourceIdentity: { sourceKind: 'git-repository', repositoryIdentity: 'github.com/user/repo', commitSha: 'abc123' } })
    const result = evaluator.assess(subject, makePolicy())
    expect(result.passed).toBe(false)
    expect(result.reason).toBe('unknown-source')
  })

  it('denies when rule effect is deny', () => {
    const policy = makePolicy({ sourceRules: [{ order: 1, sourceKind: 'npm-registry', effect: 'deny' }] })
    expect(evaluator.assess(makeSubject(), policy).passed).toBe(false)
  })
})

describe('SourceAdmissionEvaluator.assessPublisher', () => {
  it('accepted when verified issuer in trust root', () => {
    const policy = makePolicy({ publisherRules: [{ order: 1, publisherPattern: 'acme', effect: 'allow' }] })
    const result = evaluator.assessPublisher(makeSubject(), 'acme', policy, makeTrustRoot())
    expect(result.decision).toBe('accepted')
  })

  it('rejected when no verified issuer and unknownPublisher=deny', () => {
    expect(evaluator.assessPublisher(makeSubject(), undefined, makePolicy(), makeTrustRoot()).decision).toBe('rejected')
  })

  it('manual-review when no verified issuer and unknownPublisher=manual-review', () => {
    const policy = makePolicy({ unknownPublisherDecision: 'manual-review' })
    expect(evaluator.assessPublisher(makeSubject(), undefined, policy, makeTrustRoot()).decision).toBe('manual-review-required')
  })

  it('rejected when issuer not in trust root', () => {
    expect(evaluator.assessPublisher(makeSubject(), 'unknown-issuer', makePolicy(), makeTrustRoot()).decision).toBe('rejected')
  })

  it('rejected when issuer status is revoked', () => {
    const trustRoot = makeTrustRoot({ issuers: [{ issuerId: 'acme', keyId: 'key-1', algorithm: 'ed25519', publicKeyReference: 'spki', status: 'revoked' }] })
    expect(evaluator.assessPublisher(makeSubject(), 'acme', makePolicy(), trustRoot).decision).toBe('rejected')
  })
})
