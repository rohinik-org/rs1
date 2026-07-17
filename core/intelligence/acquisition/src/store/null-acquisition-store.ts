import type {
  CapabilityCandidateSet,
  CapabilityValidationReport,
  CapabilityApproval,
  CapabilityDescriptorIR,
} from '@rohinik-org/compiler'
import type { AcquisitionStore } from './acquisition-store.js'

export class NullAcquisitionStore implements AcquisitionStore {
  private readonly candidateSets = new Map<string, CapabilityCandidateSet>()
  private readonly reports = new Map<string, CapabilityValidationReport>()
  private readonly approvals = new Map<string, CapabilityApproval>()
  private readonly descriptors = new Map<string, CapabilityDescriptorIR>()

  async saveCandidateSet(set: CapabilityCandidateSet): Promise<void> {
    this.candidateSets.set(set.setId, set)
  }

  async loadCandidateSet(setId: string): Promise<CapabilityCandidateSet | undefined> {
    return this.candidateSets.get(setId)
  }

  async saveValidationReport(report: CapabilityValidationReport): Promise<void> {
    this.reports.set(report.reportId, report)
  }

  async saveApproval(approval: CapabilityApproval): Promise<void> {
    this.approvals.set(approval.approvalId, approval)
  }

  async saveDescriptor(descriptor: CapabilityDescriptorIR): Promise<void> {
    this.descriptors.set(descriptor.meta.artifactId, descriptor)
  }

  async listDescriptors(): Promise<CapabilityDescriptorIR[]> {
    return [...this.descriptors.values()]
  }
}
