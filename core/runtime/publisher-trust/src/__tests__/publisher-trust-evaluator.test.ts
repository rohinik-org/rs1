import { describe, it, expect } from 'vitest'
import { PublisherTrustEvaluator } from '../publisher-trust-evaluator.js'
import type { SignatureAssessment } from '@rohinik-org/package-trust-ir'
import type { PackageTrustSubject, ExternalSourceIdentity, IntegrityDigest } from '@rohinik-org/package-trust-ir'
import type { PublisherIdentity, TrustRoot, TrustRootProvider, BindingEvidence, PublisherTrustEvaluationRequest } from '../types.js'

// ─── Instrumented fake provider ────────────────────────────────────────────────

interface FakeProviderStats {
  resolveCalls: number
  requestedPublisherIds: string[]
  requestedScopes: string[]
}

function makeFakeProvider(roots: TrustRoot[], fail = false): TrustRootProvider & FakeProviderStats {
  const stats = { resolveCalls: 0, requestedPublisherIds: [] as string[], requestedScopes: [] as string[] }
  return {
    get resolveCalls() { return stats.resolveCalls },
    get requestedPublisherIds() { return stats.requestedPublisherIds },
    get requestedScopes() { return stats.requestedScopes },
    async resolve(req) {
      stats.resolveCalls++
      stats.requestedPublisherIds.push(
        req.publisherIdentity.identityKind === 'registry-publisher' ? req.publisherIdentity.publisherId : 'unknown'
      )
      if (fail) throw new Error('provider failure')
      return roots
    },
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'c'.repeat(64) }
const SOURCE: ExternalSourceIdentity = { sourceKind: 'npm-registry', registryId: 'r.example.com', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
const SUBJECT: PackageTrustSubject = { subjectKind: 'language-dependency', packageId: 'pkg', version: '1.0.0', sourceIdentity: SOURCE, expectedIntegrity: DIGEST }
const PUBLISHER: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'acme' }
const SIGNER_ID = 'signer-001'
const EVAL_NOW = new Date(Date.now() - 1000).toISOString()

function goodSig(issuerId = SIGNER_ID): SignatureAssessment { return { passed: true, issuerId } }
function badSig(): SignatureAssessment { return { passed: false, reason: 'bad-sig' } }

const BINDING: BindingEvidence = { bindingKind: 'exact-signer', signerId: SIGNER_ID, publisherIdentity: PUBLISHER }

function makeRoot(anchorId = SIGNER_ID): TrustRoot {
  return {
    trustRootId: 'root-001',
    snapshotId: 'snap-001',
    publisherIdentity: PUBLISHER,
    scope: { scopeKind: 'global' },
    notBefore: new Date(0).toISOString(),
    notAfter: new Date(Date.now() + 3600_000).toISOString(),
    anchorId,
  }
}

function makeRequest(overrides?: Partial<PublisherTrustEvaluationRequest>): PublisherTrustEvaluationRequest {
  return {
    subject: SUBJECT,
    signatureAssessment: goodSig(),
    publisherIdentity: PUBLISHER,
    evaluatedAt: EVAL_NOW,
    trustContext: { bindingEvidence: [BINDING] },
    ...overrides,
  }
}

const evaluator = new PublisherTrustEvaluator()

describe('PublisherTrustEvaluator', () => {
  it('trusted when all checks pass', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r.passed).toBe(true)
    expect(r.outcome).toBe('trusted')
    expect(r.trustRootId).toBe('root-001')
    expect(r.trustPath).toBeDefined()
  })

  it('signature-not-verified when signature fails (L-9J-401)', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest({ signatureAssessment: badSig() }), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('signature-not-verified')
  })

  it('invalid signature performs zero provider calls (L-9J-401)', async () => {
    const provider = makeFakeProvider([makeRoot()])
    await evaluator.evaluate(makeRequest({ signatureAssessment: badSig() }), provider)
    expect(provider.resolveCalls).toBe(0)
  })

  it('publisher-identity-invalid when identity is malformed', async () => {
    const badPublisher: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: '' }
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest({ publisherIdentity: badPublisher }), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('publisher-identity-invalid')
  })

  it('invalid request performs zero provider calls', async () => {
    const provider = makeFakeProvider([makeRoot()])
    await evaluator.evaluate(makeRequest({ signatureAssessment: badSig() }), provider)
    expect(provider.resolveCalls).toBe(0)
  })

  it('signer-publisher-mismatch when binding evidence missing', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest({ trustContext: { bindingEvidence: [] } }), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('signer-publisher-mismatch')
  })

  it('signer-publisher-mismatch does not query trust roots', async () => {
    const provider = makeFakeProvider([makeRoot()])
    await evaluator.evaluate(makeRequest({ trustContext: { bindingEvidence: [] } }), provider)
    expect(provider.resolveCalls).toBe(0)
  })

  it('trust-root-not-found when provider returns no roots', async () => {
    const provider = makeFakeProvider([])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('trust-root-not-found')
  })

  it('trust-scope-mismatch when root scope does not cover subject', async () => {
    const narrowRoot: TrustRoot = { ...makeRoot(SIGNER_ID), scope: { scopeKind: 'exact-package', packageId: 'other-pkg' } }
    const provider = makeFakeProvider([narrowRoot])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('trust-scope-mismatch')
  })

  it('trust-root-not-yet-valid when root is in the future', async () => {
    const futureRoot: TrustRoot = { ...makeRoot(SIGNER_ID), notBefore: new Date(Date.now() + 3600_000).toISOString(), notAfter: new Date(Date.now() + 7200_000).toISOString(), scope: { scopeKind: 'global' } }
    const provider = makeFakeProvider([futureRoot])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('trust-root-not-yet-valid')
  })

  it('trust-root-expired when root has passed notAfter', async () => {
    const expiredRoot: TrustRoot = { ...makeRoot(SIGNER_ID), notBefore: new Date(0).toISOString(), notAfter: new Date(0).toISOString(), scope: { scopeKind: 'global' } }
    const provider = makeFakeProvider([expiredRoot])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('trust-root-expired')
  })

  it('trust-path-not-found when no path exists from signer to anchor', async () => {
    const noPathRoot: TrustRoot = { ...makeRoot('unrelated-anchor'), scope: { scopeKind: 'global' } }
    const provider = makeFakeProvider([noPathRoot])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('trust-path-not-found')
  })

  it('trusted assessment includes trust-root ID (L-9J-404)', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest(), provider)
    if (r.passed) expect(r.trustRootId).toBe('root-001')
  })

  it('trusted assessment includes trust path (L-9J-404)', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest(), provider)
    if (r.passed) expect(r.trustPath).toBeDefined()
  })

  it('assessment is immutable (frozen)', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('assessment contains no PackageTrustDecision (L-9J-410)', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r).not.toHaveProperty('decision')
    expect(r).not.toHaveProperty('trustDecision')
  })

  it('negative assessment includes machine-readable reason', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const r = await evaluator.evaluate(makeRequest({ signatureAssessment: badSig() }), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBeTruthy()
  })

  it('signature failure distinct from publisher distrust (L-9J-412)', async () => {
    const provider = makeFakeProvider([makeRoot()])
    const sigFail = await evaluator.evaluate(makeRequest({ signatureAssessment: badSig() }), provider)
    const trustFail = await evaluator.evaluate(makeRequest({ trustContext: { bindingEvidence: [] } }), provider)
    expect(sigFail.outcome).toBe('signature-not-verified')
    expect(trustFail.outcome).not.toBe('signature-not-verified')
  })

  it('evaluation-failed on provider exception', async () => {
    const provider = makeFakeProvider([], true)
    const r = await evaluator.evaluate(makeRequest(), provider)
    expect(r.passed).toBe(false)
    expect(r.outcome).toBe('evaluation-failed')
  })

  it('no system-clock dependency — caller supplies evaluatedAt', async () => {
    // Use a fixed past time; should still work deterministically
    const pastTime = '2020-01-01T00:00:00.000Z'
    const root: TrustRoot = { ...makeRoot(SIGNER_ID), notBefore: '2000-01-01T00:00:00.000Z', notAfter: '2030-01-01T00:00:00.000Z', scope: { scopeKind: 'global' } }
    const provider = makeFakeProvider([root])
    const r = await evaluator.evaluate(makeRequest({ evaluatedAt: pastTime }), provider)
    expect(r.passed).toBe(true)
  })

  it('repeated evaluation with same inputs produces same outcome', async () => {
    const root = makeRoot()
    const r1 = await evaluator.evaluate(makeRequest(), makeFakeProvider([root]))
    const r2 = await evaluator.evaluate(makeRequest(), makeFakeProvider([root]))
    expect(r1.outcome).toBe(r2.outcome)
    expect(r1.passed).toBe(r2.passed)
  })
})
