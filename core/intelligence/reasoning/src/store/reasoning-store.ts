import type { ReasoningReport, ReasoningQuery } from '@rohinik-org/compiler'

export interface ReasoningStore {
  save(report: ReasoningReport): Promise<void>
  get(reportId: string): Promise<ReasoningReport | undefined>
  list(): Promise<readonly ReasoningReport[]>
  latest(): Promise<ReasoningReport | undefined>
  search(query: ReasoningQuery): Promise<readonly ReasoningReport[]>
  removeById(reportId: string): Promise<boolean>
}
