import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  CapabilityCandidateSet,
  CapabilityValidationReport,
  CapabilityApproval,
  CapabilityDescriptorIR,
} from '@rohinik-org/compiler'
import type { AcquisitionStore } from './acquisition-store.js'

export class JsonAcquisitionStore implements AcquisitionStore {
  private readonly base: string

  constructor(projectRoot: string) {
    this.base = join(projectRoot, '.aios', 'acquisition')
  }

  private async dir(sub: string): Promise<string> {
    const path = join(this.base, sub)
    await mkdir(path, { recursive: true })
    return path
  }

  async saveCandidateSet(set: CapabilityCandidateSet): Promise<void> {
    const d = await this.dir('candidates')
    await writeFile(join(d, `${set.setId}.json`), JSON.stringify(set, null, 2))
  }

  async loadCandidateSet(setId: string): Promise<CapabilityCandidateSet | undefined> {
    try {
      const raw = await readFile(join(this.base, 'candidates', `${setId}.json`), 'utf-8')
      return JSON.parse(raw) as CapabilityCandidateSet
    } catch {
      return undefined
    }
  }

  async saveValidationReport(report: CapabilityValidationReport): Promise<void> {
    const d = await this.dir('reports')
    await writeFile(join(d, `${report.reportId}.json`), JSON.stringify(report, null, 2))
  }

  async saveApproval(approval: CapabilityApproval): Promise<void> {
    const d = await this.dir('approvals')
    await writeFile(join(d, `${approval.approvalId}.json`), JSON.stringify(approval, null, 2))
  }

  async saveDescriptor(descriptor: CapabilityDescriptorIR): Promise<void> {
    const d = await this.dir('descriptors')
    await writeFile(join(d, `${descriptor.meta.artifactId}.json`), JSON.stringify(descriptor, null, 2))
  }

  async listDescriptors(): Promise<CapabilityDescriptorIR[]> {
    try {
      const d = join(this.base, 'descriptors')
      const files = await readdir(d)
      const results: CapabilityDescriptorIR[] = []
      for (const f of files.filter(f => f.endsWith('.json'))) {
        try {
          const raw = await readFile(join(d, f), 'utf-8')
          results.push(JSON.parse(raw) as CapabilityDescriptorIR)
        } catch { /* skip corrupt file */ }
      }
      return results
    } catch {
      return []
    }
  }
}
