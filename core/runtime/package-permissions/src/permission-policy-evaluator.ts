import type {
  CanonicalPermission,
  AuthorizedPermission,
  DeniedPermission,
  PermissionPolicy,
  PermissionPolicyRule,
} from './types.js'

export interface PolicyEvaluationResult {
  readonly granted: readonly AuthorizedPermission[]
  readonly denied: readonly DeniedPermission[]
  readonly hasConflict: boolean
}

function ruleMatches(rule: PermissionPolicyRule, permission: CanonicalPermission): boolean {
  if (rule.domain !== permission.domain) return false
  if (rule.resourcePattern === undefined) return true
  if (rule.allowWildcards === true && rule.resourcePattern === '*') return true
  return permission.value.startsWith(rule.resourcePattern)
}

export function evaluatePermissionPolicy(
  permissions: readonly CanonicalPermission[],
  policy: PermissionPolicy,
): PolicyEvaluationResult {
  const granted: AuthorizedPermission[] = []
  const denied: DeniedPermission[] = []
  let hasConflict = false

  for (const permission of permissions) {
    const matchingRules = policy.rules
      .filter(r => ruleMatches(r, permission))
      .sort((a, b) => a.order - b.order)

    if (matchingRules.length === 0) {
      // No matching rule — apply default
      if (policy.defaultEffect === 'allow') {
        granted.push({ permission })
      } else {
        denied.push({ permission, reason: 'no-matching-rule' })
      }
      continue
    }

    // L-9J-705: explicit deny overrides allow
    const hasDeny = matchingRules.some(r => r.effect === 'deny')
    if (hasDeny) {
      denied.push({ permission, reason: 'policy-deny' })
      continue
    }

    // L-9J-706: conflicting rules at same order
    const lowestOrder = matchingRules[0]!.order
    const lowestOrderRules = matchingRules.filter(r => r.order === lowestOrder)
    const effects = new Set(lowestOrderRules.map(r => r.effect))
    if (effects.size > 1) {
      // Conflicting allow + conditional or allow + something else at same precedence
      hasConflict = true
      denied.push({ permission, reason: 'policy-conflict' })
      continue
    }

    const topRule = matchingRules[0]!
    if (topRule.effect === 'conditional') {
      granted.push({ permission, conditionId: topRule.conditionId ?? 'unspecified' })
    } else {
      // effect === 'allow'
      granted.push({ permission })
    }
  }

  // Check combination rules
  if (policy.combinationRules) {
    const grantedDomains = new Set(granted.map(g => g.permission.domain))
    for (const combo of policy.combinationRules) {
      const allPresent = combo.domains.every(d => grantedDomains.has(d))
      if (allPresent && combo.severity === 'deny') {
        // Move all permissions in these domains from granted to denied
        const comboSet = new Set(combo.domains)
        const toRemove: AuthorizedPermission[] = granted.filter(g => comboSet.has(g.permission.domain))
        for (const item of toRemove) {
          const idx = granted.indexOf(item)
          if (idx !== -1) granted.splice(idx, 1)
          denied.push({ permission: item.permission, reason: `combination-rule:${combo.ruleId}` })
        }
      }
    }
  }

  return { granted, denied, hasConflict }
}
