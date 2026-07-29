import { describe, it, expect } from 'vitest'
import { hashCanonical, parseTimestamp, hashPermissionManifest, integrityIdentity } from '../policy-canonicalizer.js'
import type { PackagePermissionManifest, IntegrityDigest } from '@rohinik-org/package-trust-ir'

describe('hashCanonical', () => {
  it('returns 64-char hex', () => {
    expect(hashCanonical({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same hash regardless of key insertion order', () => {
    const a = hashCanonical({ b: 2, a: 1 })
    const b = hashCanonical({ a: 1, b: 2 })
    expect(a).toBe(b)
  })

  it('different values produce different hashes', () => {
    expect(hashCanonical({ a: 1 })).not.toBe(hashCanonical({ a: 2 }))
  })
})

describe('parseTimestamp', () => {
  it('parses valid ISO string', () => {
    expect(parseTimestamp('2026-07-01T00:00:00.000Z', 'test')).toBeInstanceOf(Date)
  })

  it('throws on invalid string', () => {
    expect(() => parseTimestamp('not-a-date', 'test')).toThrow('Invalid timestamp in test')
  })
})

describe('hashPermissionManifest', () => {
  it('excludes semanticHash field from hash input', () => {
    const manifest: PackagePermissionManifest = {
      manifestVersion: '1',
      requestedPermissions: [],
      semanticHash: 'old-hash',
    }
    const hash1 = hashPermissionManifest(manifest)
    const hash2 = hashPermissionManifest({ ...manifest, semanticHash: 'different-hash' })
    expect(hash1).toBe(hash2)
  })
})

describe('integrityIdentity', () => {
  it('produces canonical string', () => {
    const digest: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) }
    expect(integrityIdentity(digest)).toBe('sha256:hex:' + 'a'.repeat(64))
  })
})
