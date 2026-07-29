import { describe, it, expect } from 'vitest'
import { evaluateRevocationTime } from '../revocation-time-evaluator.js'
import type { RevocationEntry } from '@rohinik-org/package-trust-ir'

function makeEntry(revokedAt: string): RevocationEntry {
  return { targetKind: 'issuer', targetId: 'acme', reason: 'compromise', revokedAt }
}

describe('evaluateRevocationTime', () => {
  it('effective when revokedAt <= evaluatedAt', () => {
    const result = evaluateRevocationTime(makeEntry('2026-01-01T00:00:00.000Z'), '2026-07-01T00:00:00.000Z')
    expect(result).toBe('effective-permanent')
  })

  it('not-yet-effective when revokedAt > evaluatedAt', () => {
    const result = evaluateRevocationTime(makeEntry('2026-12-01T00:00:00.000Z'), '2026-07-01T00:00:00.000Z')
    expect(result).toBe('not-yet-effective')
  })

  it('boundary: revokedAt === evaluatedAt is effective', () => {
    const ts = '2026-07-01T00:00:00.000Z'
    const result = evaluateRevocationTime(makeEntry(ts), ts)
    expect(result).toBe('effective-permanent')
  })

  it('repeated evaluation with same time is deterministic', () => {
    const entry = makeEntry('2026-01-01T00:00:00.000Z')
    const r1 = evaluateRevocationTime(entry, '2026-07-01T00:00:00.000Z')
    const r2 = evaluateRevocationTime(entry, '2026-07-01T00:00:00.000Z')
    expect(r1).toBe(r2)
  })
})
