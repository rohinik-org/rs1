import type { ProvenanceSourceIdentity, SourceValidationResult, ProvenancePolicy } from './types.js'

const IMMUTABLE_REVISION_KINDS = new Set(['commit-sha', 'tree-digest', 'content-digest'] as const)
const MUTABLE_REVISION_KINDS = new Set(['branch'] as const)

export class SourceIdentityValidator {
  validate(
    sourceIdentity: ProvenanceSourceIdentity | undefined,
    policy: ProvenancePolicy,
    evaluatedAt: string,
  ): SourceValidationResult {
    if (!sourceIdentity) {
      if (policy.requireImmutableSourceRevision || policy.requireSourceTreeDigest) {
        return { valid: false, reason: 'source-revision-missing' }
      }
      return { valid: true }
    }

    if (!sourceIdentity.authority || sourceIdentity.authority.trim() === '') {
      return { valid: false, reason: 'source-identity-mismatch' }
    }

    if (!sourceIdentity.repository || sourceIdentity.repository.trim() === '') {
      return { valid: false, reason: 'source-identity-mismatch' }
    }

    const revision = sourceIdentity.revision
    if (!revision || !revision.value || revision.value.trim() === '') {
      return { valid: false, reason: 'source-revision-missing' }
    }

    if (revision.kind === 'unknown') {
      return { valid: false, reason: 'source-revision-invalid' }
    }

    if (policy.requireImmutableSourceRevision) {
      if (MUTABLE_REVISION_KINDS.has(revision.kind as 'branch')) {
        return { valid: false, reason: 'source-revision-invalid' }
      }
      if (!IMMUTABLE_REVISION_KINDS.has(revision.kind as 'commit-sha' | 'tree-digest' | 'content-digest')) {
        return { valid: false, reason: 'source-revision-invalid' }
      }
    }

    if (policy.requireSourceTreeDigest && revision.kind !== 'tree-digest') {
      return { valid: false, reason: 'source-revision-invalid' }
    }

    if (revision.kind === 'commit-sha' && !/^[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/.test(revision.value)) {
      return { valid: false, reason: 'source-revision-invalid' }
    }

    const revisionString = `${revision.kind}:${revision.value}`
    return { valid: true, sourceRevision: revisionString }
  }
}
