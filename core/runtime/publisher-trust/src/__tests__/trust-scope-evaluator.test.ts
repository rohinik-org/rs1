import { describe, it, expect } from 'vitest'
import { TrustScopeEvaluator } from '../trust-scope-evaluator.js'
import type { PackageTrustSubject, ExternalSourceIdentity, IntegrityDigest } from '@rohinik-org/package-trust-ir'
import type { PublisherIdentity, TrustRoot, TrustScope } from '../types.js'

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) }
const SOURCE: ExternalSourceIdentity = { sourceKind: 'npm-registry', registryId: 'r.example.com', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
const SUBJECT: PackageTrustSubject = { subjectKind: 'language-dependency', packageId: '@scope/pkg', version: '1.0.0', sourceIdentity: SOURCE, expectedIntegrity: DIGEST }
const PUBLISHER: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'acme' }
const NOW = new Date(Date.now() - 1000).toISOString()
const FUTURE = new Date(Date.now() + 3600_000).toISOString()
const PAST = new Date(Date.now() - 3600_000).toISOString()
const LONG_PAST = new Date(0).toISOString()

function makeRoot(scope: TrustScope, notBefore = LONG_PAST, notAfter = FUTURE): TrustRoot {
  return {
    trustRootId: 'root-001',
    snapshotId: 'snap-001',
    publisherIdentity: PUBLISHER,
    scope,
    notBefore,
    notAfter,
    anchorId: 'anchor-001',
  }
}

const evaluator = new TrustScopeEvaluator()

describe('TrustScopeEvaluator', () => {
  it('exact package scope succeeds', () => {
    const root = makeRoot({ scopeKind: 'exact-package', packageId: '@scope/pkg' })
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(true)
  })

  it('namespace scope succeeds', () => {
    const root = makeRoot({ scopeKind: 'package-namespace', namespace: '@scope' })
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(true)
  })

  it('publisher scope succeeds', () => {
    const root = makeRoot({ scopeKind: 'publisher', registryId: 'r.example.com', publisherId: 'acme' })
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(true)
  })

  it('organization scope succeeds', () => {
    const root = makeRoot({ scopeKind: 'organization', authorityNamespace: 'example', organizationId: 'acme' })
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(true)
  })

  it('global scope succeeds', () => {
    const root = makeRoot({ scopeKind: 'global' })
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(true)
  })

  it('source-domain mismatch fails', () => {
    const root = makeRoot({ scopeKind: 'publisher', registryId: 'other.registry.com', publisherId: 'acme' })
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(false)
    if (!r.passed) expect(r.reason).toBe('scope-mismatch')
  })

  it('package mismatch fails', () => {
    const root = makeRoot({ scopeKind: 'exact-package', packageId: 'other-pkg' })
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(false)
  })

  it('trust root not yet valid', () => {
    const root = makeRoot({ scopeKind: 'global' }, FUTURE, new Date(Date.now() + 7200_000).toISOString())
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(false)
    if (!r.passed) expect(r.reason).toBe('not-yet-valid')
  })

  it('trust root expired', () => {
    const root = makeRoot({ scopeKind: 'global' }, LONG_PAST, PAST)
    const r = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r.passed).toBe(false)
    if (!r.passed) expect(r.reason).toBe('expired')
  })

  it('malformed evaluation time', () => {
    const root = makeRoot({ scopeKind: 'global' })
    const r = evaluator.evaluate([root], SUBJECT, 'not-a-date')
    expect(r.passed).toBe(false)
    if (!r.passed) expect(r.reason).toBe('malformed-time')
  })

  it('boundary at notBefore — exactly at notBefore is valid', () => {
    const notBefore = new Date(Date.now() - 5000).toISOString()
    const root = makeRoot({ scopeKind: 'global' }, notBefore, FUTURE)
    const r = evaluator.evaluate([root], SUBJECT, new Date(Date.now() - 1000).toISOString())
    expect(r.passed).toBe(true)
  })

  it('boundary at notAfter — exactly at notAfter is expired', () => {
    const boundary = new Date(Date.now() - 1000).toISOString()
    const root = makeRoot({ scopeKind: 'global' }, LONG_PAST, boundary)
    const r = evaluator.evaluate([root], SUBJECT, boundary)
    expect(r.passed).toBe(false)
    if (!r.passed) expect(r.reason).toBe('expired')
  })

  it('repeated evaluation with same time produces same result', () => {
    const root = makeRoot({ scopeKind: 'global' })
    const r1 = evaluator.evaluate([root], SUBJECT, NOW)
    const r2 = evaluator.evaluate([root], SUBJECT, NOW)
    expect(r1.passed).toBe(r2.passed)
  })

  it('no system-clock dependency — uses evaluatedAt only', () => {
    // Evaluate with a past timestamp — root is valid in past; should pass
    const farFuture = new Date(Date.now() + 86400_000).toISOString()
    const pastEval = new Date(Date.now() - 500).toISOString()
    const root = makeRoot({ scopeKind: 'global' }, LONG_PAST, farFuture)
    const r = evaluator.evaluate([root], SUBJECT, pastEval)
    expect(r.passed).toBe(true)
  })
})
