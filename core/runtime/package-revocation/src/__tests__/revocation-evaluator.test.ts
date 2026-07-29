import { describe, it, expect } from 'vitest'
import { RevocationEvaluator } from '../revocation-evaluator.js'
import type { RevocationEvaluationRequest, RevocationEvaluationContext, RevocationPolicy } from '../types.js'
import type { PackageTrustSubject, RevocationSnapshot, SignatureAssessment } from '@rohinik-org/package-trust-ir'

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
}

const PASSED_SIG: SignatureAssessment = { passed: true, issuerId: 'acme', keyId: 'key-1' }

const STRICT_POLICY: RevocationPolicy = { requireIssuer: true, requireSigningKey: true, requirePackage: false, allowUnknown: false }

function makeCtx(overrides: Partial<RevocationEvaluationContext> = {}): RevocationEvaluationContext {
  return {
    subject: SUBJECT,
    signatureAssessment: PASSED_SIG,
    issuerId: 'acme',
    signingKeyId: 'key-1',
    evaluatedAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  }
}

function makeSnapshot(entries: RevocationSnapshot['entries'] = []): RevocationSnapshot {
  return { snapshotId: 'rs1', semanticHash: 'rsh', issuedAt: '2026-07-01T00:00:00.000Z', entries }
}

function makeRequest(ctxOverrides: Partial<RevocationEvaluationContext> = {}, snapshot = makeSnapshot()): RevocationEvaluationRequest {
  return { context: makeCtx(ctxOverrides), policy: STRICT_POLICY, snapshot }
}

const evaluator = new RevocationEvaluator()

describe('RevocationEvaluator', () => {
  it('not-revoked when snapshot empty', () => {
    const result = evaluator.evaluate(makeRequest())
    expect(result.decision).toBe('passed')
  })

  it('failed when issuer revoked', () => {
    const snapshot = makeSnapshot([{ targetKind: 'issuer', targetId: 'acme', reason: 'compromise', revokedAt: '2026-01-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(makeRequest({}, snapshot))
    expect(result.decision).toBe('failed')
  })

  it('failed when signing key revoked', () => {
    const snapshot = makeSnapshot([{ targetKind: 'key', targetId: 'key-1', reason: 'rotation', revokedAt: '2026-01-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(makeRequest({}, snapshot))
    expect(result.decision).toBe('failed')
  })

  it('failed when package-version revoked', () => {
    const snapshot = makeSnapshot([{ targetKind: 'package-version', targetId: 'lodash@4.17.21', reason: 'security', revokedAt: '2026-01-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(makeRequest({}, snapshot))
    expect(result.decision).toBe('failed')
  })

  it('manual-review-required when snapshot missing and policy requires issuer', () => {
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot: undefined })
    expect(result.decision).toBe('manual-review-required')
  })

  it('manual-review-required when missing signingKeyId and policy requires it', () => {
    const result = evaluator.evaluate(makeRequest({ signingKeyId: undefined }))
    // context validation fails → insufficient-context → manual-review-required
    expect(result.decision).toBe('manual-review-required')
  })

  it('not-revoked future-dated entry is not effective', () => {
    const snapshot = makeSnapshot([{ targetKind: 'issuer', targetId: 'acme', reason: 'future', revokedAt: '2030-01-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(makeRequest({}, snapshot))
    expect(result.decision).toBe('passed')
  })
})
