// ComplianceCertificate: produced by the ComplianceCertifier (Layer 3 trust).
// Stored in InstalledCapabilityEntry alongside the RegistrationRecord.
export interface ComplianceCertificate {
  readonly achievedLevel: number
  readonly architectureScore: number
  readonly violations: readonly string[]
  readonly certifiedAt: string
  readonly certifiedBy: string
}
