export interface AcquisitionPolicy {
  readonly autoApproveLocalSources: boolean
  readonly minConfidenceForAutoApprove: number
  readonly requireHumanApprovalForNetwork: boolean
  readonly blockedSources: readonly string[]
}

export const DEFAULT_ACQUISITION_POLICY: AcquisitionPolicy = {
  autoApproveLocalSources: true,
  minConfidenceForAutoApprove: 0.9,
  requireHumanApprovalForNetwork: true,
  blockedSources: [],
}
