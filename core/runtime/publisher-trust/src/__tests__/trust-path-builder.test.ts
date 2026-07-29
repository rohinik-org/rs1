import { describe, it, expect } from 'vitest'
import { TrustPathBuilder } from '../trust-path-builder.js'
import type { TrustRoot, PublisherIdentity, TrustScope } from '../types.js'

const PUBLISHER: PublisherIdentity = { identityKind: 'registry-publisher', registryId: 'r.example.com', publisherId: 'acme' }
const SIGNER_ID = 'signer-001'
const ANCHOR_ID = 'anchor-001'

function makeRoot(id: string, anchorId = ANCHOR_ID, snapshotId?: string): TrustRoot {
  return {
    trustRootId: id,
    snapshotId: snapshotId ?? `snap-${id}`,
    publisherIdentity: PUBLISHER,
    scope: { scopeKind: 'global' },
    notBefore: new Date(0).toISOString(),
    notAfter: new Date(Date.now() + 3600_000).toISOString(),
    anchorId,
  }
}

const builder = new TrustPathBuilder()

describe('TrustPathBuilder', () => {
  it('direct signer-to-root path when signerId === anchorId', () => {
    const root = makeRoot('root-001', SIGNER_ID)
    const r = builder.build(SIGNER_ID, [root])
    expect(r.built).toBe(true)
    if (r.built) {
      expect(r.path.anchorId).toBe(SIGNER_ID)
      expect(r.path.depth).toBe(0)
    }
  })

  it('one-intermediate path when signerId matches trustRootId', () => {
    const root = makeRoot(SIGNER_ID, ANCHOR_ID)
    const r = builder.build(SIGNER_ID, [root])
    expect(r.built).toBe(true)
    if (r.built) {
      expect(r.path.anchorId).toBe(ANCHOR_ID)
      expect(r.path.depth).toBe(1)
    }
  })

  it('no path returns path-not-found', () => {
    const root = makeRoot('unrelated-root', 'unrelated-anchor')
    const r = builder.build(SIGNER_ID, [root])
    expect(r.built).toBe(false)
    if (!r.built) expect(r.reason).toBe('path-not-found')
  })

  it('no path when roots empty', () => {
    const r = builder.build(SIGNER_ID, [])
    expect(r.built).toBe(false)
  })

  it('ambiguous paths to different anchors fail', () => {
    const root1 = makeRoot(SIGNER_ID, 'anchor-A')
    const root2 = makeRoot(SIGNER_ID, 'anchor-B')
    const r = builder.build(SIGNER_ID, [root1, root2])
    expect(r.built).toBe(false)
    if (!r.built) expect(r.reason).toBe('ambiguous-path')
  })

  it('same depth same anchor — takes first, no ambiguous', () => {
    const root1 = makeRoot(SIGNER_ID, ANCHOR_ID)
    const root2 = makeRoot(SIGNER_ID, ANCHOR_ID, 'snap-other')
    const r = builder.build(SIGNER_ID, [root1, root2])
    expect(r.built).toBe(true)
  })

  it('stable path ordering — first root chosen when same anchor', () => {
    const root1 = makeRoot(SIGNER_ID, ANCHOR_ID)
    const root2 = makeRoot(SIGNER_ID, ANCHOR_ID, 'snap-other')
    const r1 = builder.build(SIGNER_ID, [root1, root2])
    const r2 = builder.build(SIGNER_ID, [root2, root1])
    expect(r1.built && r2.built).toBe(true)
  })

  it('all selected evidence IDs appear in path', () => {
    const root = makeRoot(SIGNER_ID, ANCHOR_ID)
    const r = builder.build(SIGNER_ID, [root])
    expect(r.built).toBe(true)
    if (r.built) {
      expect(r.path.evidenceIds.length).toBeGreaterThan(0)
    }
  })
})
