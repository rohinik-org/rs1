import { describe, it, expect } from 'vitest'
import { TrustRootResolver } from '../trust-root-resolver.js'
import type { PackageTrustSubject, ExternalSourceIdentity, IntegrityDigest } from '@rohinik-org/package-trust-ir'
import type { PublisherIdentity, TrustRoot, TrustRootProvider, TrustScope } from '../types.js'

// ─── Fake provider ────────────────────────────────────────────────────────────

interface FakeProviderStats {
  resolveCalls: number
  requestedPublisherIds: string[]
  requestedScopes: string[]
}

function makeFakeProvider(
  roots: TrustRoot[],
  fail = false,
): TrustRootProvider & FakeProviderStats {
  const stats: FakeProviderStats = { resolveCalls: 0, requestedPublisherIds: [], requestedScopes: [] }
  return {
    get resolveCalls() { return stats.resolveCalls },
    get requestedPublisherIds() { return stats.requestedPublisherIds },
    get requestedScopes() { return stats.requestedScopes },
    async resolve(req) {
      stats.resolveCalls++
      if (fail) throw new Error('provider failure')
      return roots
    },
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DIGEST: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
const SOURCE: ExternalSourceIdentity = { sourceKind: 'npm-registry', registryId: 'r.example.com', artifactLocator: 'pkg/-/pkg-1.0.0.tgz' }
const SUBJECT: PackageTrustSubject = { subjectKind: 'language-dependency', packageId: 'pkg', version: '1.0.0', sourceIdentity: SOURCE, expectedIntegrity: DIGEST }
const PUBLISHER: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'acme' }
const EVAL_NOW = new Date(Date.now() - 1000).toISOString()

function makeRoot(id: string, scope: TrustScope): TrustRoot {
  return {
    trustRootId: id,
    snapshotId: `snap-${id}`,
    publisherIdentity: PUBLISHER,
    scope,
    notBefore: new Date(0).toISOString(),
    notAfter: new Date(Date.now() + 3600_000).toISOString(),
    anchorId: `anchor-${id}`,
  }
}

const EXACT_ROOT = makeRoot('root-exact', { scopeKind: 'exact-package', packageId: 'pkg' })
const NS_ROOT = makeRoot('root-ns', { scopeKind: 'package-namespace', namespace: 'pkg' })
const PUB_ROOT = makeRoot('root-pub', { scopeKind: 'publisher', registryId: 'r.example.com', publisherId: 'acme' })
const ORG_ROOT = makeRoot('root-org', { scopeKind: 'organization', authorityNamespace: 'example', organizationId: 'acme' })
const GLOBAL_ROOT = makeRoot('root-global', { scopeKind: 'global' })

const resolver = new TrustRootResolver()

describe('TrustRootResolver', () => {
  it('exact publisher root resolved', async () => {
    const provider = makeFakeProvider([EXACT_ROOT])
    const r = await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r.resolved).toBe(true)
  })

  it('namespace root resolved', async () => {
    const provider = makeFakeProvider([NS_ROOT])
    const r = await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r.resolved).toBe(true)
  })

  it('organization root resolved', async () => {
    const provider = makeFakeProvider([ORG_ROOT])
    const r = await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r.resolved).toBe(true)
  })

  it('global root resolved', async () => {
    const provider = makeFakeProvider([GLOBAL_ROOT])
    const r = await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r.resolved).toBe(true)
  })

  it('empty provider returns not-found', async () => {
    const provider = makeFakeProvider([])
    const r = await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r.resolved).toBe(false)
    if (!r.resolved) expect(r.reason).toBe('not-found')
  })

  it('duplicate identical roots deduplicated', async () => {
    const dup = { ...EXACT_ROOT }
    const provider = makeFakeProvider([EXACT_ROOT, dup])
    const r = await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r.resolved).toBe(true)
    if (r.resolved) expect(r.roots.length).toBe(1)
  })

  it('provider failure mapped to provider-failure', async () => {
    const provider = makeFakeProvider([], true)
    const r = await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r.resolved).toBe(false)
    if (!r.resolved) expect(r.reason).toBe('provider-failure')
  })

  it('provider ordering does not alter deterministic result', async () => {
    const provider1 = makeFakeProvider([EXACT_ROOT, GLOBAL_ROOT])
    const provider2 = makeFakeProvider([GLOBAL_ROOT, EXACT_ROOT])
    const r1 = await resolver.resolve(provider1, PUBLISHER, SUBJECT, EVAL_NOW)
    const r2 = await resolver.resolve(provider2, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(r1.resolved && r2.resolved).toBe(true)
    if (r1.resolved && r2.resolved) {
      // Exact-package has higher specificity — it should come first in both
      expect(r1.roots[0]!.trustRootId).toBe('root-exact')
      expect(r2.roots[0]!.trustRootId).toBe('root-exact')
    }
  })

  it('exactly one provider call per evaluation', async () => {
    const provider = makeFakeProvider([EXACT_ROOT])
    await resolver.resolve(provider, PUBLISHER, SUBJECT, EVAL_NOW)
    expect(provider.resolveCalls).toBe(1)
  })
})
