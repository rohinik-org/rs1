import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type { TrustRoot, TrustScope } from './types.js'

export type ScopeEvaluationResult =
  | { readonly passed: true; readonly matchedScope: TrustScope }
  | { readonly passed: false; readonly reason: 'scope-mismatch' | 'not-yet-valid' | 'expired' | 'malformed-time' }

function isTimestampValid(ts: string): boolean {
  return !isNaN(new Date(ts).getTime())
}

function scopeCoversSubject(scope: TrustScope, subject: PackageTrustSubject): boolean {
  switch (scope.scopeKind) {
    case 'global':
      return true
    case 'trust-domain':
      return true // domain applies to all packages in domain; domain matching is via trust-root selection
    case 'organization':
      return true // organization scope covers all packages under the org
    case 'publisher': {
      const si = subject.sourceIdentity
      if (si.sourceKind === 'npm-registry' || si.sourceKind === 'organization-registry' ||
          si.sourceKind === 'pypi-registry' || si.sourceKind === 'model-registry' ||
          si.sourceKind === 'oci-registry' || si.sourceKind === 'rohinik-marketplace') {
        return si.registryId === scope.registryId
      }
      return false
    }
    case 'package-namespace':
      return subject.packageId.startsWith(scope.namespace + '/') || subject.packageId === scope.namespace
    case 'exact-package': {
      if (subject.packageId !== scope.packageId) return false
      if (scope.registryId !== undefined) {
        const si = subject.sourceIdentity
        if (si.sourceKind === 'npm-registry' || si.sourceKind === 'organization-registry' ||
            si.sourceKind === 'pypi-registry' || si.sourceKind === 'model-registry' ||
            si.sourceKind === 'oci-registry' || si.sourceKind === 'rohinik-marketplace') {
          return si.registryId === scope.registryId
        }
        return false
      }
      return true
    }
  }
}

export class TrustScopeEvaluator {
  evaluate(
    roots: readonly TrustRoot[],
    subject: PackageTrustSubject,
    evaluatedAt: string,
  ): ScopeEvaluationResult {
    if (!isTimestampValid(evaluatedAt)) {
      return { passed: false, reason: 'malformed-time' }
    }

    const now = new Date(evaluatedAt).getTime()

    // Try roots in the order provided (already sorted by specificity from resolver)
    for (const root of roots) {
      if (!scopeCoversSubject(root.scope, subject)) {
        continue
      }

      if (!isTimestampValid(root.notBefore) || !isTimestampValid(root.notAfter)) {
        continue
      }

      const notBefore = new Date(root.notBefore).getTime()
      const notAfter = new Date(root.notAfter).getTime()

      if (now < notBefore) {
        return { passed: false, reason: 'not-yet-valid' }
      }
      if (now >= notAfter) {
        return { passed: false, reason: 'expired' }
      }

      return { passed: true, matchedScope: root.scope }
    }

    return { passed: false, reason: 'scope-mismatch' }
  }
}
