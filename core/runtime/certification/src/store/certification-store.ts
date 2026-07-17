import type { CertificationReport, CertificationQuery } from '@rohinik-org/compiler'

export interface CertificationStore {
  save(report: CertificationReport): Promise<void>
  get(reportId: string): Promise<CertificationReport | undefined>
  list(): Promise<readonly CertificationReport[]>
  search(query: CertificationQuery): Promise<readonly CertificationReport[]>
  latest(): Promise<CertificationReport | undefined>
}
