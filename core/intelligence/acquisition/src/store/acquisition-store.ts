import type {
  CapabilityCandidateSet,
  CapabilityValidationReport,
  CapabilityApproval,
  CapabilityDescriptorIR,
} from '@rohinik-org/compiler'

export interface AcquisitionStore {
  saveCandidateSet(set: CapabilityCandidateSet): Promise<void>
  loadCandidateSet(setId: string): Promise<CapabilityCandidateSet | undefined>
  saveValidationReport(report: CapabilityValidationReport): Promise<void>
  saveApproval(approval: CapabilityApproval): Promise<void>
  saveDescriptor(descriptor: CapabilityDescriptorIR): Promise<void>
  listDescriptors(): Promise<CapabilityDescriptorIR[]>
}
