import { describe, it, expect } from 'vitest'
import { validateRevocationRecord } from '../revocation-record-validator.js'
import type { RevocationEntry } from '@rohinik-org/package-trust-ir'
import type { RevocationSubject } from '../types.js'

const SUBJECT: RevocationSubject = { targetKind: 'issuer', targetId: 'acme' }

function makeEntry(overrides: Partial<RevocationEntry> = {}): RevocationEntry {
  return {
    targetKind: 'issuer',
    targetId: 'acme',
    reason: 'key-compromise',
    revokedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('validateRevocationRecord', () => {
  it('valid record passes', () => {
    expect(validateRevocationRecord(makeEntry(), SUBJECT).valid).toBe(true)
  })

  it('target-kind mismatch fails', () => {
    const result = validateRevocationRecord(makeEntry({ targetKind: 'key' }), SUBJECT)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/target-kind-mismatch/)
  })

  it('target-ID mismatch fails', () => {
    const result = validateRevocationRecord(makeEntry({ targetId: 'other-issuer' }), SUBJECT)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/target-id-mismatch/)
  })

  it('malformed revokedAt fails', () => {
    const result = validateRevocationRecord(makeEntry({ revokedAt: 'not-a-date' }), SUBJECT)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/revokedAt/)
  })

  it('missing reason fails', () => {
    const result = validateRevocationRecord(makeEntry({ reason: '' }), SUBJECT)
    expect(result.valid).toBe(false)
    expect((result as any).reason).toMatch(/reason/)
  })
})
