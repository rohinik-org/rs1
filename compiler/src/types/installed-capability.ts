export interface CatalogInstallSource {
  readonly scheme: string
  readonly location: string
}

export type InstalledCapabilityStatus = 'enabled' | 'disabled' | 'error'

// Persistent record of one installed adapter in the Capability Catalog.
// This is the source of truth for what's installed — separate from
// rohinik.yaml (which is configuration, not installation state).
export interface InstalledCapabilityEntry {
  readonly id: string
  // Canonical globally-unique identity: rohinik://publisher/name (optional; absent for v1 installs)
  readonly packageId?: string
  readonly version: string
  readonly protocol: string
  readonly source: CatalogInstallSource
  readonly installedAt: string
  readonly updatedAt?: string
  readonly status: InstalledCapabilityStatus
  readonly registeredCapabilityIds: readonly string[]
  readonly descriptorIrId: string
  readonly registrationRecordId: string
  readonly complianceLevel: number
  readonly contentHash?: string
  readonly publisherName?: string
  readonly signatureVerified?: boolean
  readonly complianceCertificate?: import('./compliance-certificate.js').ComplianceCertificate
  readonly notes?: string
}

// The full catalog — persisted to .rohinik/catalog.json
export interface CapabilityCatalogSnapshot {
  readonly catalogVersion: string
  readonly updatedAt: string
  readonly entries: readonly InstalledCapabilityEntry[]
}
