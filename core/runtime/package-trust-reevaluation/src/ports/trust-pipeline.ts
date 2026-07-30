import type { PackageTrustPipelineInput, PackageTrustPipelineResult } from '../types.js'

export interface TrustPipeline {
  reevaluate(input: PackageTrustPipelineInput): Promise<PackageTrustPipelineResult>
}
