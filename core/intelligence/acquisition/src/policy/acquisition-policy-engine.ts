import { randomUUID } from 'node:crypto'
import type { CapabilityCandidate, CapabilityValidationReport, CapabilityApproval, AcquisitionPolicy } from '@rohinik-org/compiler'

const LOCAL_SOURCE_IDS = new Set(['local'])

export class AcquisitionPolicyEngine {
  decide(
    candidate: CapabilityCandidate,
    report: CapabilityValidationReport,
    policy: AcquisitionPolicy,
  ): CapabilityApproval {
    const now = new Date().toISOString()

    if (policy.blockedSources.includes(candidate.sourceId)) {
      return { kind: 'CapabilityApproval', approvalId: randomUUID(), candidateId: candidate.candidateId, reportId: report.reportId, decision: 'REJECTED', decidedBy: 'POLICY', reason: 'source is blocked', decidedAt: now }
    }

    if (!report.passed) {
      return { kind: 'CapabilityApproval', approvalId: randomUUID(), candidateId: candidate.candidateId, reportId: report.reportId, decision: 'REJECTED', decidedBy: 'POLICY', reason: 'validation failed', decidedAt: now }
    }

    if (candidate.confidence < policy.minConfidenceForAutoApprove) {
      return { kind: 'CapabilityApproval', approvalId: randomUUID(), candidateId: candidate.candidateId, reportId: report.reportId, decision: 'DEFERRED', decidedBy: 'POLICY', reason: 'confidence below threshold', decidedAt: now }
    }

    const isLocal = LOCAL_SOURCE_IDS.has(candidate.sourceId) || candidate.installSource.scheme === 'file'

    if (isLocal && policy.autoApproveLocalSources) {
      return { kind: 'CapabilityApproval', approvalId: randomUUID(), candidateId: candidate.candidateId, reportId: report.reportId, decision: 'APPROVED', decidedBy: 'POLICY', decidedAt: now }
    }

    if (!isLocal && policy.requireHumanApprovalForNetwork) {
      return { kind: 'CapabilityApproval', approvalId: randomUUID(), candidateId: candidate.candidateId, reportId: report.reportId, decision: 'DEFERRED', decidedBy: 'POLICY', reason: 'requires human approval', decidedAt: now }
    }

    return { kind: 'CapabilityApproval', approvalId: randomUUID(), candidateId: candidate.candidateId, reportId: report.reportId, decision: 'APPROVED', decidedBy: 'POLICY', decidedAt: now }
  }
}
