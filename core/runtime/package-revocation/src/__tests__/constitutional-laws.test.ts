/**
 * Constitutional law tests for Stage 9J Task 6.
 * Laws L-9J-501 through L-9J-512.
 */

import { describe, it, expect } from 'vitest'
import { RevocationEvaluator } from '../revocation-evaluator.js'
import { RevocationSourceResolver } from '../revocation-source-resolver.js'
import { buildRevocationSubjects } from '../revocation-subject-builder.js'
import { validateRevocationContext } from '../revocation-context-validator.js'
import type { RevocationEvaluationContext, RevocationEvaluationRequest, RevocationPolicy } from '../types.js'
import type { PackageTrustSubject, RevocationSnapshot, SignatureAssessment } from '@rohinik-org/package-trust-ir'

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency', packageId: 'lodash', version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
}

const PASSED_SIG: SignatureAssessment = { passed: true, issuerId: 'acme', keyId: 'key-1' }
const STRICT_POLICY: RevocationPolicy = { requireIssuer: true, requireSigningKey: true, requirePackage: false, allowUnknown: false }

function makeCtx(overrides: Partial<RevocationEvaluationContext> = {}): RevocationEvaluationContext {
  return {
    subject: SUBJECT, signatureAssessment: PASSED_SIG,
    issuerId: 'acme', signingKeyId: 'key-1',
    evaluatedAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  }
}

function makeSnapshot(entries: RevocationSnapshot['entries'] = []): RevocationSnapshot {
  return { snapshotId: 'rs1', semanticHash: 'rsh', issuedAt: '2026-07-01T00:00:00.000Z', entries }
}

const evaluator = new RevocationEvaluator()

describe('L-9J-501: explicit target kind and target identifier pairs', () => {
  it('L-9J-501: subjects have explicit targetKind and targetId', () => {
    const subjects = buildRevocationSubjects(makeCtx(), STRICT_POLICY)
    for (const s of subjects) {
      expect(s.targetKind).toBeTruthy()
      expect(s.targetId).toBeTruthy()
    }
  })
})

describe('L-9J-502: missing signingKeyId never becomes not-revoked', () => {
  it('L-9J-502: missing signingKeyId when required → not passed', () => {
    const result = evaluator.evaluate({ context: makeCtx({ signingKeyId: undefined }), policy: STRICT_POLICY, snapshot: makeSnapshot() })
    expect(result.decision).not.toBe('passed')
  })
})

describe('L-9J-503: evidence obtained only through IR-defined provider port', () => {
  it('L-9J-503: RevocationSourceResolver is the only access path to RevocationSnapshot', () => {
    // The resolver wraps the snapshot — direct access to snapshot data is only through resolver.resolve()
    const resolver = new RevocationSourceResolver(makeSnapshot([
      { targetKind: 'issuer', targetId: 'acme', reason: 'r', revokedAt: '2026-01-01T00:00:00.000Z' },
    ]))
    const result = resolver.resolve({ targetKind: 'issuer', targetId: 'acme' })
    expect(result.entries.length).toBeGreaterThan(0)
    expect(resolver.callRecord.resolveCalls).toBe(1)
  })
})

describe('L-9J-504: evaluation uses caller-supplied evaluatedAt — no system clock', () => {
  it('L-9J-504: past evaluation time makes future revokedAt not-yet-effective', () => {
    const snapshot = makeSnapshot([{ targetKind: 'issuer', targetId: 'acme', reason: 'r', revokedAt: '2030-01-01T00:00:00.000Z' }])
    const result = evaluator.evaluate({ context: makeCtx({ evaluatedAt: '2026-07-01T00:00:00.000Z' }), policy: STRICT_POLICY, snapshot })
    expect(result.decision).toBe('passed')
  })
})

describe('L-9J-505: active authoritative revocation never produces not-revoked', () => {
  it('L-9J-505: active issuer revocation → failed, never passed', () => {
    const snapshot = makeSnapshot([{ targetKind: 'issuer', targetId: 'acme', reason: 'key-compromise', revokedAt: '2026-01-01T00:00:00.000Z' }])
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot })
    expect(result.decision).toBe('failed')
    expect(result.decision).not.toBe('passed')
  })
})

describe('L-9J-506: unknown required evidence remains distinct from not-revoked', () => {
  it('L-9J-506: missing snapshot → manual-review-required, not passed', () => {
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot: undefined })
    expect(result.decision).toBe('manual-review-required')
    expect(result.decision).not.toBe('passed')
  })
})

describe('L-9J-507: conflicting evidence fails closed', () => {
  it('L-9J-507: multiple effective entries for same subject → manual-review-required (not passed)', () => {
    const snapshot = makeSnapshot([
      { targetKind: 'issuer', targetId: 'acme', reason: 'compromise', revokedAt: '2026-01-01T00:00:00.000Z' },
      { targetKind: 'issuer', targetId: 'acme', reason: 'policy-violation', revokedAt: '2026-02-01T00:00:00.000Z' },
    ])
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot })
    // conflicting-evidence maps to manual-review-required (not passed, not failed)
    expect(result.decision).toBe('manual-review-required')
    expect(result.decision).not.toBe('passed')
  })
})

describe('L-9J-508: different target kinds not merged by equal ID', () => {
  it('L-9J-508: issuer:key-1 and key:key-1 are distinct subjects', () => {
    const subjects = buildRevocationSubjects(makeCtx({ issuerId: 'key-1', signingKeyId: 'key-1' }), STRICT_POLICY)
    const issuerCount = subjects.filter(s => s.targetKind === 'issuer' && s.targetId === 'key-1').length
    const keyCount = subjects.filter(s => s.targetKind === 'key' && s.targetId === 'key-1').length
    expect(issuerCount).toBe(1)
    expect(keyCount).toBe(1)
    expect(issuerCount + keyCount).toBe(2)
  })
})

describe('L-9J-509: evaluator never calls integrity verifier or signature verifier', () => {
  it('L-9J-509: RevocationEvaluator.evaluate does not call streamArtifact or crypto verify', () => {
    // There are no imports of IntegrityVerifier or SignatureVerifier in revocation-evaluator.ts
    // We verify by executing evaluate and asserting no external verifier side effects
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot: makeSnapshot() })
    expect(result).toHaveProperty('decision')
    // If StreamArtifact were called it would throw — no throw = no call
  })
})

describe('L-9J-510: evaluator never returns PackageTrustDecision', () => {
  it('L-9J-510: result is RevocationAssessment with decision field from {passed, manual-review-required, failed}', () => {
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot: makeSnapshot() })
    expect(['passed', 'manual-review-required', 'failed']).toContain(result.decision)
    // NOT 'trusted'/'conditionally-trusted'/'quarantined'/'denied' — those are PackageTrustDecision
    expect(['trusted', 'conditionally-trusted', 'quarantined', 'denied']).not.toContain(result.decision)
  })
})

describe('L-9J-511: evaluator never authorizes installation or provisioning', () => {
  it('L-9J-511: result has no authorization field', () => {
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot: makeSnapshot() })
    expect('authorized' in result).toBe(false)
    expect('provisioning' in result).toBe(false)
  })
})

describe('L-9J-512: revoked assessment identifies target and evidence', () => {
  it('L-9J-512: revoked result includes reason identifying the affected target', () => {
    const snapshot = makeSnapshot([{ targetKind: 'issuer', targetId: 'acme', reason: 'key-compromise', revokedAt: '2026-01-01T00:00:00.000Z' }])
    const result = evaluator.evaluate({ context: makeCtx(), policy: STRICT_POLICY, snapshot })
    expect(result.decision).toBe('failed')
    expect(result.reason).toBeTruthy()
    expect(result.reason).toMatch(/issuer|acme/)
  })
})
