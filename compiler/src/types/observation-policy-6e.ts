export interface ObservationPolicy {
  readonly minimumConfidence: number
  readonly allowInternet: boolean
  readonly allowProviderMetrics: boolean
  readonly allowFilesystem: boolean
  readonly allowEnterpriseApis: boolean
  readonly maxObservationAgeSeconds: number
  readonly blockedDomains: readonly string[]
}

export const DEFAULT_OBSERVATION_POLICY: ObservationPolicy = {
  minimumConfidence: 0.7,
  allowInternet: true,
  allowProviderMetrics: true,
  allowFilesystem: true,
  allowEnterpriseApis: false,
  maxObservationAgeSeconds: 86400,
  blockedDomains: [],
}
