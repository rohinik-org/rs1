import type { TrustPipeline } from '../../ports/trust-pipeline.js'
import type { PackageTrustPipelineInput, PackageTrustPipelineResult } from '../../types.js'

export class InMemoryTrustPipeline implements TrustPipeline {
  // Default: echo back trusted decision with same policy
  simulateFailure = false
  simulatedDecision: import('@rohinik-org/package-trust-ir').PackageTrustDecision = 'trusted'

  readonly calls: PackageTrustPipelineInput[] = []

  async reevaluate(input: PackageTrustPipelineInput): Promise<PackageTrustPipelineResult> {
    if (this.simulateFailure) throw new Error('pipeline-unavailable')
    this.calls.push(input)
    return {
      workItemId: input.workItemId,
      decision: this.simulatedDecision,
      assessmentReferences: input.inputReferences.assessmentReferences.slice(),
      policyReference: input.inputReferences.currentPolicyReference,
      producedAt: input.requestedAt,
    }
  }
}
