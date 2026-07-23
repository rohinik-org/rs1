import {
  DEFAULT_QUALITY_WEIGHTS,
  QualityDimension,
  clampScore,
  contextQualityReportId,
  computePolicyHash,
} from '@rohinik-org/context-quality-ir'
import type {
  ContextPackageId,
  ContextQualityVector,
  RequirementCoverage,
  QualityViolation,
  QualityWarning,
  ContextQualityReport,
  AdmissionPolicy,
  Clock,
  IdGenerator,
} from '@rohinik-org/context-quality-ir'
import { RequirementCoverageStatus as RCS } from '@rohinik-org/context-quality-ir'

interface BuilderDeps {
  readonly idGenerator: IdGenerator
  readonly clock:       Clock
}

export class QualityReportBuilder {
  constructor(private readonly deps: BuilderDeps) {}

  build(
    packageId:        ContextPackageId,
    vector:           ContextQualityVector,
    coverage:         readonly RequirementCoverage[],
    safetyWarnings:   readonly QualityWarning[],
    extraWarnings:    readonly QualityWarning[],
    evaluatorVersion: string,
    policy:           AdmissionPolicy,
  ): ContextQualityReport {
    const compositeScore = clampScore(
      (Object.keys(DEFAULT_QUALITY_WEIGHTS) as QualityDimension[])
        .reduce((sum, dim) => sum + vector[dim] * DEFAULT_QUALITY_WEIGHTS[dim], 0)
    )

    const violations: QualityViolation[] = []
    const warnings:   QualityWarning[]   = [...safetyWarnings, ...extraWarnings]

    for (const dim of Object.keys(vector) as QualityDimension[]) {
      const floor = policy.dimensionFloors[dim]
      if (floor !== undefined && vector[dim] < floor) {
        violations.push({
          dimension: dim,
          score:     vector[dim],
          threshold: floor,
          message:   `Dimension ${dim} score ${vector[dim].toFixed(3)} below floor ${floor}`,
        })
      }
    }

    for (const cov of coverage) {
      if (cov.mandatory && (cov.status === RCS.UNSATISFIED || cov.status === RCS.CONFLICTED)) {
        violations.push({
          dimension:     QualityDimension.COVERAGE,
          score:         cov.score,
          threshold:     1.0,
          message:       `Mandatory requirement ${cov.requirementId} ${cov.status}`,
          requirementId: cov.requirementId,
        })
      }
      if (!cov.mandatory && cov.status === RCS.UNSATISFIED) {
        warnings.push({
          dimension: QualityDimension.COVERAGE,
          message:   `Optional requirement ${cov.requirementId} unsatisfied`,
        })
      }
    }

    return {
      reportId:         contextQualityReportId(this.deps.idGenerator.nextId('report')),
      packageId,
      vector,
      compositeScore,
      coverage,
      violations,
      warnings,
      evaluatedAt:      this.deps.clock.now(),
      evaluatorVersion,
      policyId:         policy.policyId,
      policyHash:       computePolicyHash(policy),
    }
  }
}
