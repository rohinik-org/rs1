import type { DiagnosticArtifactBase } from './diagnostic-artifact.js'

export type RegistrationStatus = 'ADMITTED' | 'REJECTED' | 'PENDING'
export type CompatibilityStatus = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN'

export interface RegistrationRecord extends DiagnosticArtifactBase {
  // meta.kind = 'RegistrationRecord'
  // DiagnosticArtifactBase: has subject ('what was analyzed'), not provenance
  readonly status: RegistrationStatus
  readonly compatibilityStatus: CompatibilityStatus
  readonly complianceLevel: number
  readonly registeredCapabilityIds: readonly string[]
  readonly errors?: readonly string[]
  readonly warnings?: readonly string[]
}
