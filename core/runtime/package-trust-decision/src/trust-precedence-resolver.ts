import type {
  MatchedRule,
  PrecedenceResolution,
  BlockingFinding,
  ManualReviewFinding,
  DegradingFinding,
  AdvisoryFinding,
  RuleSpecificity,
} from './types.js'

const SPECIFICITY_ORDER: readonly RuleSpecificity[] = [
  'exact-package-version',
  'exact-package',
  'namespace',
  'exact-publisher',
  'publisher-class',
  'package-class',
  'environment',
  'tenant',
  'global',
]

function rank(s: RuleSpecificity): number {
  return SPECIFICITY_ORDER.indexOf(s)
}

export class TrustPrecedenceResolver {
  resolve(matchedRules: readonly MatchedRule[]): PrecedenceResolution {
    const blocking: BlockingFinding[] = []
    const manualReview: ManualReviewFinding[] = []
    const degrading: DegradingFinding[] = []
    const advisory: AdvisoryFinding[] = []
    const appliedRuleIds: string[] = []

    // Group by specificity to detect equal-specificity conflicts
    const bySpecificity = new Map<number, MatchedRule[]>()
    for (const mr of matchedRules) {
      const r = rank(mr.specificity)
      const existing = bySpecificity.get(r) ?? []
      existing.push(mr)
      bySpecificity.set(r, existing)
    }

    // Process from most specific to least specific
    const specificityGroups = [...bySpecificity.entries()].sort((a, b) => a[0] - b[0])

    for (const [, group] of specificityGroups) {
      const hasAllow = group.some(r => r.rule.effect === 'allow')
      const hasDeny = group.some(r => r.rule.effect === 'deny')

      if (hasDeny && hasAllow) {
        // Equal-specificity conflict: fail closed to manual-review
        manualReview.push({
          kind: 'manual-review',
          code: 'equal-specificity-policy-conflict',
          assessmentType: 'policy',
          detail: 'Equal-specificity allow and deny rules conflict',
        })
        for (const mr of group) appliedRuleIds.push(mr.rule.ruleId)
        continue
      }

      for (const mr of group) {
        appliedRuleIds.push(mr.rule.ruleId)
        switch (mr.rule.effect) {
          case 'deny':
            blocking.push({
              kind: 'blocking',
              code: mr.rule.ruleId,
              assessmentType: mr.rule.assessmentType ?? 'policy',
              ...(mr.rule.detail !== undefined ? { detail: mr.rule.detail } : {}),
            })
            break
          case 'manual-review':
            manualReview.push({
              kind: 'manual-review',
              code: mr.rule.ruleId,
              assessmentType: mr.rule.assessmentType ?? 'policy',
              ...(mr.rule.detail !== undefined ? { detail: mr.rule.detail } : {}),
            })
            break
          case 'degrade':
            degrading.push({
              kind: 'degrading',
              code: mr.rule.ruleId,
              assessmentType: mr.rule.assessmentType ?? 'policy',
              ...(mr.rule.detail !== undefined ? { detail: mr.rule.detail } : {}),
            })
            break
          case 'advisory':
            advisory.push({
              kind: 'advisory',
              code: mr.rule.ruleId,
              assessmentType: mr.rule.assessmentType ?? 'policy',
              ...(mr.rule.detail !== undefined ? { detail: mr.rule.detail } : {}),
            })
            break
          // 'allow' produces no finding
        }
      }
    }

    const sortFindings = <T extends { code: string }>(arr: T[]): T[] =>
      [...arr].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)

    return {
      blockingFindings: sortFindings(blocking),
      manualReviewFindings: sortFindings(manualReview),
      degradingFindings: sortFindings(degrading),
      advisoryFindings: sortFindings(advisory),
      appliedRuleIds: [...new Set(appliedRuleIds)].sort(),
    }
  }
}
