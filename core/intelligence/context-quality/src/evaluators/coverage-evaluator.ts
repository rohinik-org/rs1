import { clampScore, RequirementCoverageStatus } from '@rohinik-org/context-quality-ir'
import type { ContextItem, ContextRequirement, RequirementCoverage } from '@rohinik-org/context-quality-ir'

interface CoverageResult {
  readonly score:    number
  readonly coverage: readonly RequirementCoverage[]
}

export class CoverageEvaluator {
  evaluate(items: readonly ContextItem[], requirements: readonly ContextRequirement[]): CoverageResult {
    if (requirements.length === 0) return { score: 1.0, coverage: [] }

    const coverage: RequirementCoverage[] = requirements.map(req => {
      const supporting = items.filter(item =>
        item.relevance.requirementRefs.includes(req.requirementId)
      )
      const supportingItemIds = supporting.map(i => i.itemId)

      if (supporting.length === 0) {
        return {
          requirementId:     req.requirementId,
          mandatory:         req.mandatory,
          status:            RequirementCoverageStatus.UNSATISFIED,
          supportingItemIds: [],
          score:             0,
          cardinalityMet:    false,
        }
      }

      // Cardinality check
      const min = req.cardinality?.minimum ?? 1
      const max = req.cardinality?.maximum
      const cardinalityMet = supporting.length >= min && (max === undefined || supporting.length <= max)

      // Authority check
      const authorityOk = req.minimumAuthority === undefined ||
        supporting.some(i => i.authority.score >= req.minimumAuthority!)

      // Source kind check
      const sourceKindOk = !req.acceptedSourceKinds || req.acceptedSourceKinds.length === 0 ||
        supporting.some(i => req.acceptedSourceKinds!.includes(i.authority.sourceKind))

      const avgScore = clampScore(supporting.reduce((s, i) => s + i.relevance.score, 0) / supporting.length)

      let status: RequirementCoverageStatus
      if (!cardinalityMet || !authorityOk || !sourceKindOk) {
        status = RequirementCoverageStatus.PARTIALLY_SATISFIED
      } else {
        status = RequirementCoverageStatus.SATISFIED
      }

      return {
        requirementId:     req.requirementId,
        mandatory:         req.mandatory,
        status,
        supportingItemIds,
        score:             avgScore,
        cardinalityMet,
      }
    })

    // Score: mandatory unsatisfied = big penalty; optional unsatisfied = small penalty
    let score = 1.0
    for (const cov of coverage) {
      if (cov.status === RequirementCoverageStatus.UNSATISFIED) {
        score -= cov.mandatory ? 0.6 : 0.1
      } else if (cov.status === RequirementCoverageStatus.PARTIALLY_SATISFIED) {
        score -= cov.mandatory ? 0.2 : 0.05
      }
    }

    return { score: clampScore(score), coverage }
  }
}
