import type { RuntimeScenario, RuntimeValidationReport, ScenarioTag } from '@rohinik-org/compiler'

export interface ScenarioStore {
  save(scenario: RuntimeScenario): Promise<void>
  load(scenarioId: string): Promise<RuntimeScenario | undefined>
  list(tag?: ScenarioTag): Promise<RuntimeScenario[]>
  saveReport(report: RuntimeValidationReport): Promise<void>
  loadReport(reportId: string): Promise<RuntimeValidationReport | undefined>
}

export class NullScenarioStore implements ScenarioStore {
  async save(_s: RuntimeScenario): Promise<void> {}
  async load(_id: string): Promise<RuntimeScenario | undefined> { return undefined }
  async list(_tag?: ScenarioTag): Promise<RuntimeScenario[]> { return [] }
  async saveReport(_r: RuntimeValidationReport): Promise<void> {}
  async loadReport(_id: string): Promise<RuntimeValidationReport | undefined> { return undefined }
}

export class InMemoryScenarioStore implements ScenarioStore {
  private readonly scenarios = new Map<string, RuntimeScenario>()
  private readonly reports = new Map<string, RuntimeValidationReport>()

  async save(s: RuntimeScenario): Promise<void> { this.scenarios.set(s.scenarioId, s) }
  async load(id: string): Promise<RuntimeScenario | undefined> { return this.scenarios.get(id) }
  async list(tag?: ScenarioTag): Promise<RuntimeScenario[]> {
    const all = [...this.scenarios.values()]
    return tag ? all.filter(s => s.tags.includes(tag)) : all
  }
  async saveReport(r: RuntimeValidationReport): Promise<void> { this.reports.set(r.reportId, r) }
  async loadReport(id: string): Promise<RuntimeValidationReport | undefined> { return this.reports.get(id) }
}
