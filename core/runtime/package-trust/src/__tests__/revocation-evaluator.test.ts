import { describe, it, expect } from 'vitest'
import { RevocationEvaluator } from '../revocation-evaluator.js'
import type { PackageTrustSubject, RevocationSnapshot, IntegrityDigest } from '@rohinik-org/package-trust-ir'
import { integrityIdentity } from '../policy-canonicalizer.js'

const SUBJECT: PackageTrustSubject = {
  subjectKind: 'language-dependency',
  packageId: 'lodash',
  version: '4.17.21',
  sourceIdentity: { sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
  expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
}

const OBSERVED: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }

function makeSnapshot(entries: RevocationSnapshot['entries'] = []): RevocationSnapshot {
  return { snapshotId: 'rs1', semanticHash: 'rsh', issuedAt: '2026-07-01T00:00:00.000Z', entries }
}

const evaluator = new RevocationEvaluator()

describe('RevocationEvaluator', () => {
  it('passes with empty snapshot', () => {
    const result = evaluator.evaluate(SUBJECT, OBSERVED, makeSnapshot(), undefined)
    expect(result.decision).toBe('passed')
  })

  it('fails when package-version revoked', () => {
    const snapshot = makeSnapshot([{ targetKind: 'package-version', targetId: 'lodash@4.17.21', reason: 'security', revokedAt: '2026-07-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(SUBJECT, OBSERVED, snapshot, undefined)
    expect(result.decision).toBe('failed')
    expect(result.reason).toBe('package-version-revoked')
  })

  it('fails when artifact digest revoked', () => {
    const snapshot = makeSnapshot([{ targetKind: 'artifact-digest', targetId: integrityIdentity(OBSERVED), reason: 'security', revokedAt: '2026-07-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(SUBJECT, OBSERVED, snapshot, undefined)
    expect(result.decision).toBe('failed')
    expect(result.reason).toBe('artifact-revoked')
  })

  it('L-9J-005: issuer revocation matches actual signing issuer', () => {
    const snapshot = makeSnapshot([{ targetKind: 'issuer', targetId: 'acme', reason: 'key-compromise', revokedAt: '2026-07-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(SUBJECT, OBSERVED, snapshot, 'acme')
    expect(result.decision).toBe('failed')
    expect(result.reason).toBe('issuer-revoked')
  })

  it('L-9J-005: issuer revocation does not apply when no signingIssuerId', () => {
    const snapshot = makeSnapshot([{ targetKind: 'issuer', targetId: 'acme', reason: 'key-compromise', revokedAt: '2026-07-01T00:00:00.000Z' }])
    const result = evaluator.evaluate(SUBJECT, OBSERVED, snapshot, undefined)
    expect(result.decision).toBe('passed')
  })

  it('manual-review-required when no snapshot', () => {
    const result = evaluator.evaluate(SUBJECT, OBSERVED, undefined, undefined)
    expect(result.decision).toBe('manual-review-required')
  })
})
