import { describe, it, expect } from 'vitest'
import {
  PackageSourceDeniedError,
  PackageIntegrityMismatchError,
  PackageSignatureInvalidError,
  PackageAuthorizationError,
  PackageQuarantinedError,
} from '../index.js'
import type {
  ArtifactByteReader,
  PackageTrustEvaluator,
  QuarantineStore,
  PackageTrustRepository,
  TrustReevaluationService,
  TrustContainmentPort,
  TrustPublicKeyProvider,
  VulnerabilityScanner,
} from '../index.js'

// ─── Runtime error class exports ─────────────────────────────────────────────

describe('error class exports', () => {
  it('PackageSourceDeniedError is a constructor', () => {
    expect(typeof PackageSourceDeniedError).toBe('function')
  })

  it('PackageIntegrityMismatchError is a constructor', () => {
    expect(typeof PackageIntegrityMismatchError).toBe('function')
  })

  it('PackageSignatureInvalidError is a constructor', () => {
    expect(typeof PackageSignatureInvalidError).toBe('function')
  })

  it('PackageAuthorizationError is a constructor', () => {
    expect(typeof PackageAuthorizationError).toBe('function')
  })

  it('PackageQuarantinedError is a constructor', () => {
    expect(typeof PackageQuarantinedError).toBe('function')
  })
})

describe('error class instances', () => {
  const subject = {
    subjectKind: 'language-dependency' as const,
    packageId: 'lodash',
    version: '4.17.21',
    sourceIdentity: { sourceKind: 'npm-registry' as const, registryId: 'npmjs.org', artifactLocator: 'lodash@4.17.21' },
    expectedIntegrity: { algorithm: 'sha256' as const, encoding: 'hex' as const, value: 'a'.repeat(64) },
  }

  it('PackageSourceDeniedError extends Error and has correct name', () => {
    const err = new PackageSourceDeniedError(['integrity-mismatch'], subject)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('PackageSourceDeniedError')
    expect(err.reasonCodes).toContain('integrity-mismatch')
  })

  it('PackageIntegrityMismatchError exposes expected and observed', () => {
    const err = new PackageIntegrityMismatchError(subject, 'a'.repeat(64), 'b'.repeat(64))
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('PackageIntegrityMismatchError')
    expect(err.expectedDigest).toBe('a'.repeat(64))
    expect(err.observedDigest).toBe('b'.repeat(64))
  })

  it('PackageSignatureInvalidError has reason field', () => {
    const err = new PackageSignatureInvalidError(subject, 'key-revoked')
    expect(err.reason).toBe('key-revoked')
  })

  it('PackageAuthorizationError has reason field', () => {
    const err = new PackageAuthorizationError('expired-authorization')
    expect(err.reason).toBe('expired-authorization')
  })

  it('PackageQuarantinedError exposes quarantineId', () => {
    const err = new PackageQuarantinedError('qid-1' as any, subject, ['integrity-mismatch'])
    expect(err.quarantineId).toBe('qid-1')
  })
})

// ─── No I-prefix port names ───────────────────────────────────────────────────

describe('no I-prefixed port names', () => {
  it('IArtifactByteReader is not exported', async () => {
    const mod = await import('../index.js')
    expect('IArtifactByteReader' in mod).toBe(false)
  })

  it('IPackageTrustRepository is not exported', async () => {
    const mod = await import('../index.js')
    expect('IPackageTrustRepository' in mod).toBe(false)
  })

  it('IQuarantineStore is not exported', async () => {
    const mod = await import('../index.js')
    expect('IQuarantineStore' in mod).toBe(false)
  })
})

// ─── Compile-time port shape checks (type-level only, no runtime value needed) ──

// These declarations confirm the named port interfaces are exported and usable.
// TypeScript will error at compile time if they are missing or malformed.
type _ArtifactByteReader = ArtifactByteReader
type _PackageTrustEvaluator = PackageTrustEvaluator
type _QuarantineStore = QuarantineStore
type _PackageTrustRepository = PackageTrustRepository
type _TrustReevaluationService = TrustReevaluationService
type _TrustContainmentPort = TrustContainmentPort
type _TrustPublicKeyProvider = TrustPublicKeyProvider
type _VulnerabilityScanner = VulnerabilityScanner
