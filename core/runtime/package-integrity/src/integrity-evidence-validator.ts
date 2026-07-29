import type {
  PackageTrustSubject,
  ExpectedIntegrityEvidence,
  InertArtifactHandle,
  AcquisitionAuthorization,
  ExternalSourceIdentity,
  IntegrityDigest,
} from '@rohinik-org/package-trust-ir'

export type EvidenceValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: 'subject-mismatch' | 'source-mismatch' | 'digest-format-invalid' | 'authorization-expired' | 'authority-invalid' }

function sourceIdentityEqual(a: ExternalSourceIdentity, b: ExternalSourceIdentity): boolean {
  if (a.sourceKind !== b.sourceKind) return false
  switch (a.sourceKind) {
    case 'workspace':
      return b.sourceKind === 'workspace' && a.workspaceId === b.workspaceId && a.artifactId === b.artifactId
    case 'organization-registry':
    case 'rohinik-marketplace':
    case 'npm-registry':
    case 'pypi-registry':
    case 'model-registry':
    case 'oci-registry':
      return (
        b.sourceKind === a.sourceKind &&
        (b as typeof a).registryId === a.registryId &&
        (b as typeof a).artifactLocator === a.artifactLocator
      )
    case 'git-repository':
      return (
        b.sourceKind === 'git-repository' &&
        a.repositoryIdentity === b.repositoryIdentity &&
        a.commitSha === b.commitSha
      )
    case 'direct-artifact':
      return (
        b.sourceKind === 'direct-artifact' &&
        a.authorizedSourceId === b.authorizedSourceId &&
        a.artifactLocator === b.artifactLocator
      )
  }
}

function subjectEqual(a: PackageTrustSubject, b: PackageTrustSubject): boolean {
  return (
    a.subjectKind === b.subjectKind &&
    a.packageId === b.packageId &&
    a.version === b.version &&
    sourceIdentityEqual(a.sourceIdentity, b.sourceIdentity) &&
    digestEqual(a.expectedIntegrity, b.expectedIntegrity)
  )
}

function digestEqual(a: IntegrityDigest, b: IntegrityDigest): boolean {
  return a.algorithm === b.algorithm && a.encoding === b.encoding && a.value.toLowerCase() === b.value.toLowerCase()
}

function isValidHex(value: string, algorithm: 'sha256' | 'sha512'): boolean {
  const expectedLen = algorithm === 'sha256' ? 64 : 128
  return value.length === expectedLen && /^[0-9a-fA-F]+$/.test(value)
}

function isValidSriBase64(value: string, algorithm: 'sha256' | 'sha512'): boolean {
  const prefix = `${algorithm}-`
  if (!value.startsWith(prefix)) return false
  const b64 = value.slice(prefix.length)
  try {
    const binary = atob(b64)
    const expectedBytes = algorithm === 'sha256' ? 32 : 64
    return binary.length === expectedBytes
  } catch {
    return false
  }
}

function isDigestStructurallyValid(digest: IntegrityDigest): boolean {
  if (digest.encoding === 'hex') return isValidHex(digest.value, digest.algorithm)
  return isValidSriBase64(digest.value, digest.algorithm)
}

function isAuthorityValid(evidence: ExpectedIntegrityEvidence): boolean {
  const { authority } = evidence
  switch (authority.authorityKind) {
    case 'signed-catalog':
      return Boolean(authority.catalogId && authority.snapshotSemanticHash && authority.signingKeyId)
    case 'registry-metadata':
      return Boolean(authority.registryId && authority.metadataSemanticHash)
    case 'content-addressed-reference':
      return Boolean(authority.storeId)
    case 'authorized-local-declaration':
      return Boolean(authority.declarationId && authority.authorizedBy)
  }
}

export class IntegrityEvidenceValidator {
  validate(
    subject: PackageTrustSubject,
    authorization: AcquisitionAuthorization,
    handle: InertArtifactHandle,
    evidence: ExpectedIntegrityEvidence,
    evaluatedAt: string,
  ): EvidenceValidationResult {
    if (!subjectEqual(evidence.subject, subject)) {
      return { valid: false, reason: 'subject-mismatch' }
    }
    if (!subjectEqual(handle.subject, subject)) {
      return { valid: false, reason: 'subject-mismatch' }
    }
    if (!subjectEqual(authorization.subject, subject)) {
      return { valid: false, reason: 'subject-mismatch' }
    }
    if (!sourceIdentityEqual(handle.acquiredFrom, subject.sourceIdentity)) {
      return { valid: false, reason: 'source-mismatch' }
    }
    if (!digestEqual(evidence.expectedIntegrity, subject.expectedIntegrity)) {
      return { valid: false, reason: 'subject-mismatch' }
    }
    if (new Date(evaluatedAt) >= new Date(authorization.expiresAt)) {
      return { valid: false, reason: 'authorization-expired' }
    }
    if (!isDigestStructurallyValid(evidence.expectedIntegrity)) {
      return { valid: false, reason: 'digest-format-invalid' }
    }
    if (!isAuthorityValid(evidence)) {
      return { valid: false, reason: 'authority-invalid' }
    }
    return { valid: true }
  }
}
