import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type { PublisherIdentity, TrustRoot, TrustScope, TrustRootProvider } from './types.js'
import { PublisherIdentityValidator } from './publisher-identity-validator.js'

export type TrustRootResolutionResult =
  | { readonly resolved: true; readonly roots: readonly TrustRoot[] }
  | { readonly resolved: false; readonly reason: 'not-found' | 'provider-failure' | 'conflicting-roots' }

function scopeSpecificity(scope: TrustScope): number {
  switch (scope.scopeKind) {
    case 'exact-package': return 6
    case 'package-namespace': return 5
    case 'publisher': return 4
    case 'organization': return 3
    case 'trust-domain': return 2
    case 'global': return 1
  }
}

function trustRootSortKey(r: TrustRoot): string {
  const scope = r.scope
  const domainKey = scope.scopeKind === 'trust-domain' ? scope.domain : ''
  const specificity = String(scopeSpecificity(scope)).padStart(2, '0')
  const anchorKey = r.anchorId
  const rootKey = r.trustRootId
  return `${specificity}:${domainKey}:${anchorKey}:${rootKey}`
}

export class TrustRootResolver {
  private readonly validator = new PublisherIdentityValidator()

  async resolve(
    provider: TrustRootProvider,
    publisherIdentity: PublisherIdentity,
    subject: PackageTrustSubject,
    evaluatedAt: string,
  ): Promise<TrustRootResolutionResult> {
    let roots: readonly TrustRoot[]
    try {
      roots = await provider.resolve({ publisherIdentity, subject, evaluatedAt })
    } catch (err) {
      return { resolved: false, reason: 'provider-failure' }
    }

    if (roots.length === 0) {
      return { resolved: false, reason: 'not-found' }
    }

    // Deduplicate by trustRootId — keep first occurrence in stable order
    const seen = new Set<string>()
    const deduped: TrustRoot[] = []
    for (const root of roots) {
      if (!seen.has(root.trustRootId)) {
        seen.add(root.trustRootId)
        deduped.push(root)
      }
    }

    // Stable sort: specificity desc → domain → anchorId → trustRootId
    const sorted = [...deduped].sort((a, b) => {
      const ka = trustRootSortKey(a)
      const kb = trustRootSortKey(b)
      // Higher specificity first
      const specA = scopeSpecificity(a.scope)
      const specB = scopeSpecificity(b.scope)
      if (specA !== specB) return specB - specA
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })

    return { resolved: true, roots: sorted }
  }
}
