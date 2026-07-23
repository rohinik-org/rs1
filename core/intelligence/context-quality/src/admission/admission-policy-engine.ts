import {
  ContextAdmissionDecision,
  ContextQualityErrorCode,
  QualityDimension,
  RequirementCoverageStatus,
  computeContractHash,
  computePolicyHash,
} from '@rohinik-org/context-quality-ir'
import type {
  ContextQualityReport,
  AdmissionPolicy,
  ContextPackage,
  ContextContract,
  ContextAdmissionResult,
  ContextAdmissionService,
  AdmissionReason,
} from '@rohinik-org/context-quality-ir'
import { ContextManifestBuilder } from '../manifest/manifest-builder.js'

export class AdmissionPolicyEngine implements ContextAdmissionService {
  constructor(private readonly manifestBuilder: ContextManifestBuilder) {}

  async decide(
    report:       ContextQualityReport,
    policy:       AdmissionPolicy,
    pkg:          ContextPackage,
    contract:     ContextContract,
    attemptCount: number,
  ): Promise<ContextAdmissionResult> {
    const reasons: AdmissionReason[] = []

    // L-11D-004: Safety is absolute first gate
    const safetyFloor = policy.dimensionFloors[QualityDimension.SAFETY] ?? 0.9
    if (policy.mandatoryDimensions.includes(QualityDimension.SAFETY) && report.vector.safety < safetyFloor) {
      reasons.push({ code: ContextQualityErrorCode.SAFETY_POLICY_VIOLATION, message: `Safety score ${report.vector.safety.toFixed(3)} below floor ${safetyFloor}` })
      return { decision: ContextAdmissionDecision.REJECTED, reasons }
    }

    // Check mandatory dimension floors
    for (const dim of policy.mandatoryDimensions) {
      if (dim === QualityDimension.SAFETY) continue
      const floor = policy.dimensionFloors[dim]
      if (floor !== undefined && report.vector[dim] < floor) {
        reasons.push({
          code:    ContextQualityErrorCode.QUALITY_DIMENSION_BELOW_THRESHOLD,
          message: `Mandatory dimension ${dim} score ${report.vector[dim].toFixed(3)} below floor ${floor}`,
        })
      }
    }

    if (reasons.length > 0) {
      return { decision: ContextAdmissionDecision.REJECTED, reasons }
    }

    // L-11D-003: Check mandatory coverage (unsatisfied OR conflicted both trigger retry/reject)
    const failedMandatory = report.coverage.filter(
      c => c.mandatory && (c.status === RequirementCoverageStatus.UNSATISFIED || c.status === RequirementCoverageStatus.CONFLICTED)
    )
    if (failedMandatory.length > 0) {
      if (attemptCount < policy.maximumRetries) {
        return {
          decision: ContextAdmissionDecision.RETRY_REQUIRED,
          retryDirective: {
            previousPackageId: pkg.packageId,
            attempt:           attemptCount + 1,
            reasons:           failedMandatory.map(c => `Requirement ${c.requirementId} ${c.status}`),
            requestedActions:  failedMandatory.map(c => ({ type: 'retrieve_requirement' as const, requirementId: c.requirementId })),
            remainingBudget:   { remainingAttempts: policy.maximumRetries - attemptCount - 1 },
          },
          reasons: [{ code: ContextQualityErrorCode.MANDATORY_COVERAGE_FAILED, message: 'Mandatory requirements failed' }],
        }
      }
      reasons.push({ code: ContextQualityErrorCode.RETRY_LIMIT_EXCEEDED, message: 'Mandatory requirements failed and retry limit exhausted' })
      return { decision: ContextAdmissionDecision.REJECTED, reasons }
    }

    // Composite score gate
    if (report.compositeScore < policy.minimumCompositeScore) {
      reasons.push({
        code:    ContextQualityErrorCode.COMPOSITE_SCORE_BELOW_THRESHOLD,
        message: `Composite score ${report.compositeScore.toFixed(3)} below minimum ${policy.minimumCompositeScore}`,
      })
      return { decision: ContextAdmissionDecision.REJECTED, reasons }
    }

    // Detect degradation: non-mandatory dims below degraded floors
    const degradedDims = (Object.keys(report.vector) as QualityDimension[]).filter(dim => {
      if (policy.mandatoryDimensions.includes(dim)) return false
      const floor = policy.degradedDimensionFloors?.[dim] ?? policy.dimensionFloors[dim] ?? 0.5
      return report.vector[dim] < floor
    })

    const contractHash = computeContractHash(contract)
    const policyHash   = computePolicyHash(policy)
    const decision     = degradedDims.length > 0 && policy.allowDegraded
      ? ContextAdmissionDecision.ADMITTED_DEGRADED
      : ContextAdmissionDecision.ADMITTED

    const manifest = this.manifestBuilder.build(pkg, report, decision, contractHash, policyHash, degradedDims)

    return { decision, admittedManifest: manifest, reasons }
  }
}
