import type { ReflectionReport, ReflectionQuery } from '@rohinik-org/compiler'

export interface ReflectionStore {
  save(report: ReflectionReport): Promise<void>
  get(reportId: string): Promise<ReflectionReport | undefined>
  list(): Promise<readonly ReflectionReport[]>
  latest(): Promise<ReflectionReport | undefined>
  search(query: ReflectionQuery): Promise<readonly ReflectionReport[]>
  removeById(reportId: string): Promise<boolean>
}
