import type { CertificationScenario, CertificationResult, CertificationReport, CertificationViolation } from '@rohinik-org/compiler'
import { filterScenarios } from '../loader/scenario-loader.js'
import { scheduleBatches } from '../scheduler/scenario-scheduler.js'
import { ScenarioExecutor } from '../executor/scenario-executor.js'
import { CertificationAnalyzer } from '../analyzer/certification-analyzer.js'
import { collectBenchmark } from '../benchmark/benchmark-collector.js'
import { createReport } from '../reporter/certification-reporter.js'
import type { CertificationStore } from '../store/certification-store.js'
import type { ScenarioRunner } from '../executor/scenario-executor.js'

export type RunnerMap = Record<string, ScenarioRunner>

export class CertificationRunner {
  private readonly executor = new ScenarioExecutor()

  constructor(
    private readonly store: CertificationStore,
    private readonly analyzer: CertificationAnalyzer = new CertificationAnalyzer(),
  ) {}

  async run(scenarios: readonly CertificationScenario[], runners: RunnerMap): Promise<CertificationReport> {
    const startedAt = new Date().toISOString()
    const loaded = filterScenarios(scenarios)
    const batches = scheduleBatches(loaded)
    const results: CertificationResult[] = []

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(scenario => this.runOne(scenario, runners[scenario.scenarioId]))
      )
      results.push(...batchResults)
    }

    const report = createReport(results, startedAt)
    await this.store.save(report)
    return report
  }

  private async runOne(scenario: CertificationScenario, runner: ScenarioRunner | undefined): Promise<CertificationResult> {
    const effectiveRunner: ScenarioRunner = runner ?? (() => Promise.resolve({}))
    const output = await this.executor.execute(scenario, effectiveRunner)
    const violations = this.analyzer.analyze(scenario.scenarioId, scenario.expectations, output.actualResult)
    const bm = collectBenchmark(scenario.scenarioId, output.timingMs, scenario.timeoutMs, output.memMb)

    const hasFail = violations.some(v => v.severity === 'ERROR' || v.severity === 'CRITICAL')
    const hasWarn = violations.some(v => v.severity === 'WARNING') || !bm.withinBaseline
    const status = hasFail ? 'FAIL' : hasWarn ? 'WARNING' : 'PASS'

    return {
      resultId: crypto.randomUUID(),
      scenarioId: scenario.scenarioId,
      name: scenario.name,
      category: scenario.tags[0] ?? 'FULL_PIPELINE',
      status,
      violations: violations as readonly CertificationViolation[],
      benchmark: bm,
      completedAt: new Date().toISOString(),
    }
  }
}
