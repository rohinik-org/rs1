import { describe, it, expect } from 'vitest'
import { AcquisitionAuthorizer } from '../acquisition-authorizer.js'
import type {
  AcquisitionAuthorization,
  AcquisitionAuthorizationId,
  PackageTrustSubject,
  ExternalSourceIdentity,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

const INTEGRITY: IntegrityDigest = { algorithm: 'sha256', encoding: 'hex', value: 'abc123' }

function makeSourceIdentity(): ExternalSourceIdentity {
  return { sourceKind: 'npm-registry', registryId: 'registry.npmjs.org', artifactLocator: 'lodash/-/lodash-4.17.21.tgz' }
}

function makeSubject(overrides?: Partial<PackageTrustSubject>): PackageTrustSubject {
  return {
    subjectKind: 'language-dependency',
    packageId: 'lodash',
    version: '4.17.21',
    sourceIdentity: makeSourceIdentity(),
    expectedIntegrity: INTEGRITY,
    ...overrides,
  }
}

function makeAuthorization(overrides?: Partial<AcquisitionAuthorization>): AcquisitionAuthorization {
  const subject = makeSubject()
  return {
    acquisitionAuthorizationId: 'auth-001' as AcquisitionAuthorizationId,
    subject,
    issuedAt: new Date(0).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

describe('AcquisitionAuthorizer', () => {
  const authorizer = new AcquisitionAuthorizer()

  it('authorizes valid request', () => {
    const auth = makeAuthorization()
    const result = authorizer.authorize(auth, makeSubject(), makeSourceIdentity())
    expect(result.authorized).toBe(true)
    if (result.authorized) {
      expect(result.authorization).toBe(auth)
    }
  })

  it('rejects expired authorization', () => {
    const auth = makeAuthorization({ expiresAt: new Date(0).toISOString() })
    const result = authorizer.authorize(auth, makeSubject(), makeSourceIdentity())
    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.reason).toBe('expired')
    }
  })

  it('rejects subject mismatch — different version', () => {
    const auth = makeAuthorization()
    const differentSubject = makeSubject({ version: '4.17.20' })
    const result = authorizer.authorize(auth, differentSubject, makeSourceIdentity())
    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.reason).toBe('subject-mismatch')
    }
  })

  it('rejects subject mismatch — different packageId', () => {
    const auth = makeAuthorization()
    const differentSubject = makeSubject({ packageId: 'lodash-es' })
    const result = authorizer.authorize(auth, differentSubject, makeSourceIdentity())
    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.reason).toBe('subject-mismatch')
    }
  })

  it('rejects source mismatch', () => {
    const auth = makeAuthorization()
    const differentSource: ExternalSourceIdentity = {
      sourceKind: 'npm-registry',
      registryId: 'registry.yarnpkg.com',
      artifactLocator: 'lodash/-/lodash-4.17.21.tgz',
    }
    const result = authorizer.authorize(auth, makeSubject(), differentSource)
    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.reason).toBe('source-mismatch')
    }
  })

  it('uses provided now for expiry check — not yet expired', () => {
    const auth = makeAuthorization({ expiresAt: '2030-01-01T00:00:00.000Z' })
    const result = authorizer.authorize(auth, makeSubject(), makeSourceIdentity(), '2025-01-01T00:00:00.000Z')
    expect(result.authorized).toBe(true)
  })

  it('uses provided now for expiry check — exactly expired', () => {
    const expiry = '2025-01-01T00:00:00.000Z'
    const auth = makeAuthorization({ expiresAt: expiry })
    const result = authorizer.authorize(auth, makeSubject(), makeSourceIdentity(), expiry)
    expect(result.authorized).toBe(false)
    if (!result.authorized) {
      expect(result.reason).toBe('expired')
    }
  })
})
