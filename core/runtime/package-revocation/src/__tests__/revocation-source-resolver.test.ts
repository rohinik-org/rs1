import { describe, it, expect } from 'vitest'
import { RevocationSourceResolver } from '../revocation-source-resolver.js'
import type { RevocationSnapshot } from '@rohinik-org/package-trust-ir'
import type { RevocationSubject } from '../types.js'

const ISSUER_SUBJECT: RevocationSubject = { targetKind: 'issuer', targetId: 'acme' }
const KEY_SUBJECT: RevocationSubject = { targetKind: 'key', targetId: 'key-1' }

function makeSnapshot(entries: RevocationSnapshot['entries'] = []): RevocationSnapshot {
  return { snapshotId: 'rs1', semanticHash: 'rsh', issuedAt: '2026-07-01T00:00:00.000Z', entries }
}

describe('RevocationSourceResolver', () => {
  it('one query per unique subject', () => {
    const resolver = new RevocationSourceResolver(makeSnapshot())
    resolver.resolve(ISSUER_SUBJECT)
    resolver.resolve(ISSUER_SUBJECT) // duplicate
    expect(resolver.callRecord.resolveCalls).toBe(1)
  })

  it('no duplicate queries for duplicate subjects', () => {
    const resolver = new RevocationSourceResolver(makeSnapshot())
    resolver.resolve(ISSUER_SUBJECT)
    resolver.resolve(ISSUER_SUBJECT)
    expect(resolver.callRecord.requestedSubjects).toHaveLength(1)
  })

  it('no record distinguished from provider failure (snapshot missing)', () => {
    const resolver = new RevocationSourceResolver(undefined)
    const result = resolver.resolve(ISSUER_SUBJECT)
    expect(result.available).toBe(false)
    expect(result.entries).toHaveLength(0)
  })

  it('provider error safely mapped — snapshot present but no matching entries', () => {
    const resolver = new RevocationSourceResolver(makeSnapshot())
    const result = resolver.resolve(ISSUER_SUBJECT)
    expect(result.available).toBe(true)
    expect(result.entries).toHaveLength(0)
  })

  it('returns matching entries only', () => {
    const snapshot = makeSnapshot([
      { targetKind: 'issuer', targetId: 'acme', reason: 'compromise', revokedAt: '2026-07-01T00:00:00.000Z' },
      { targetKind: 'key', targetId: 'key-1', reason: 'rotation', revokedAt: '2026-07-01T00:00:00.000Z' },
    ])
    const resolver = new RevocationSourceResolver(snapshot)
    const result = resolver.resolve(ISSUER_SUBJECT)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.targetId).toBe('acme')
  })
})
