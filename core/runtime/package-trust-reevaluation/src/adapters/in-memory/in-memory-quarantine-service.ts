import type { QuarantineService } from '../../ports/quarantine-service.js'
import type { PackageQuarantineRequest, PackageQuarantineResult } from '@rohinik-org/package-quarantine'

export class InMemoryQuarantineService implements QuarantineService {
  readonly requests: PackageQuarantineRequest[] = []
  simulateFailure = false

  async quarantine(request: PackageQuarantineRequest): Promise<PackageQuarantineResult> {
    if (this.simulateFailure) throw new Error('quarantine-unavailable')
    this.requests.push(request)
    return {
      operationId: request.operationId,
      subject: request.subject,
      outcome: 'quarantined',
      trustDecision: request.trustDecision,
      trustDecisionId: request.trustDecisionId ?? '',
      policyId: request.policy.policyId,
      policyVersion: request.policy.policyVersion,
      evidence: {
        operationId: request.operationId,
        subject: request.subject,
        trustDecisionId: request.trustDecisionId ?? '',
        trustDecision: request.trustDecision,
        policyId: request.policy.policyId,
        policyVersion: request.policy.policyVersion,
        mode: request.policy.defaultMode,
        sourceLocation: request.artifact.sourceLocation,
        storageReceipts: [],
        verificationFindings: [],
        lifecycleTransitions: [],
        restrictions: [],
        requestedAt: request.requestedAt,
      },
      requestedAt: request.requestedAt,
    }
  }
}
