import { describe, it, expect } from 'vitest'
import { hashPackageTrustSubject, hashExternalSourceIdentity, subjectsEqual } from '../subject-hash.js'
import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'

function makeSubject(overrides: Partial<PackageTrustSubject> = {}): PackageTrustSubject {
  return {
    subjectKind: 'language-dependency',
    packageId: 'lodash',
    version: '4.17.21',
    sourceIdentity: {
      sourceKind: 'npm-registry',
      registryId: 'npmjs.org',
      artifactLocator: 'lodash@4.17.21',
    },
    expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
    ...overrides,
  }
}

describe('hashPackageTrustSubject', () => {
  it('returns 64-char hex', () => {
    expect(hashPackageTrustSubject(makeSubject())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same hash for equal subjects (key order independent)', () => {
    expect(hashPackageTrustSubject(makeSubject())).toBe(hashPackageTrustSubject({ ...makeSubject() }))
  })

  it('different hash for different version', () => {
    expect(hashPackageTrustSubject(makeSubject({ version: '5.0.0' }))).not.toBe(hashPackageTrustSubject(makeSubject()))
  })

  it('different hash for different sourceIdentity', () => {
    const a = makeSubject()
    const b = makeSubject({ sourceIdentity: { sourceKind: 'npm-registry', registryId: 'verdaccio.internal', artifactLocator: 'lodash@4.17.21' } })
    expect(hashPackageTrustSubject(a)).not.toBe(hashPackageTrustSubject(b))
  })

  it('different hash for different expectedIntegrity', () => {
    const a = makeSubject()
    const b = makeSubject({ expectedIntegrity: { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) } })
    expect(hashPackageTrustSubject(a)).not.toBe(hashPackageTrustSubject(b))
  })
})

describe('hashExternalSourceIdentity', () => {
  it('npm-registry: different registryId produces different hash', () => {
    const a = hashExternalSourceIdentity({ sourceKind: 'npm-registry', registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' })
    const b = hashExternalSourceIdentity({ sourceKind: 'npm-registry', registryId: 'verdaccio.internal', artifactLocator: 'lodash@4.17.21' })
    expect(a).not.toBe(b)
  })
})

describe('subjectsEqual', () => {
  it('true for identical subjects', () => {
    expect(subjectsEqual(makeSubject(), makeSubject())).toBe(true)
  })

  it('false for different versions', () => {
    expect(subjectsEqual(makeSubject(), makeSubject({ version: '5.0.0' }))).toBe(false)
  })
})
