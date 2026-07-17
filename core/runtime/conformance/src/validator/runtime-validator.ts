import type { RuntimeScenario, RuntimeValidationReport, RuntimeBenchmark, ValidationFinding, ValidationStatus } from '@rohinik-org/compiler'
import { randomUUID } from 'crypto'
import { FixtureLoader } from '../fixture/fixture-loader.js'
import { DEFAULT_VALIDATION_POLICY } from '../policy/validation-policy.js'
import type { ValidationPolicy } from '../policy/validation-policy.js'
import type { ScenarioRunner } from './scenario-runner.js'

export class RuntimeValidator {
  private readonly loader = new FixtureLoader()
  private readonly runners = new Map<string, ScenarioRunner>()

  constructor(private readonly policy: ValidationPolicy = DEFAULT_VALIDATION_POLICY) {}

  register(scenarioId: string, runner: ScenarioRunner): void {
    this.runners.set(scenarioId, runner)
  }

  async run(scenario: RuntimeScenario): Promise<RuntimeValidationReport> {
    const startedAt = new Date().toISOString()
    const startMs = Date.now()
    const findings: ValidationFinding[] = []

    if (scenario.scenarioType === 'LIVE' && !this.policy.allowLiveScenarios) {
      return this.report(scenario.scenarioId, startedAt, 0, 'FAILED', [
        { findingId: randomUUID(), severity: 'ERROR', message: 'LIVE scenario blocked by policy', component: 'ValidationPolicy' },
      ])
    }

    const loaded = this.loader.load(scenario.initialState)
    const runner = this.runners.get(scenario.scenarioId)
    let actualOutcome: Record<string, unknown> = {}

    if (runner) {
      try {
        actualOutcome = await runner(loaded, scenario.expectedOutcome)
      } catch (err) {
        findings.push({ findingId: randomUUID(), severity: 'ERROR', message: String(err), component: scenario.scenarioId })
      }
    }

    const executionMs = Date.now() - startMs
    const memMb = process.memoryUsage().heapUsed / 1_048_576

    // compare expectations
    const exp = scenario.expectedOutcome
    if (exp.triggerEmitted !== undefined && actualOutcome['triggerEmitted'] !== exp.triggerEmitted) {
      findings.push({ findingId: randomUUID(), severity: 'ERROR', message: `Expected triggerEmitted=${exp.triggerEmitted}, got ${actualOutcome['triggerEmitted']}` })
    }
    if (exp.episodeRecorded !== undefined && actualOutcome['episodeRecorded'] !== exp.episodeRecorded) {
      findings.push({ findingId: randomUUID(), severity: 'ERROR', message: `Expected episodeRecorded=${exp.episodeRecorded}, got ${actualOutcome['episodeRecorded']}` })
    }
    if (exp.executionOutcome !== undefined && actualOutcome['executionOutcome'] !== exp.executionOutcome) {
      findings.push({ findingId: randomUUID(), severity: 'ERROR', message: `Expected executionOutcome=${exp.executionOutcome}, got ${actualOutcome['executionOutcome']}` })
    }

    // performance regression warning
    const baseline = (actualOutcome['baselineMs'] as number | undefined) ?? 0
    if (baseline > 0 && executionMs > baseline * this.policy.performanceRegressionThreshold) {
      findings.push({ findingId: randomUUID(), severity: 'WARNING', message: `Performance regression: ${executionMs}ms > baseline ${baseline}ms * ${this.policy.performanceRegressionThreshold}` })
    }

    const hasError = findings.some(f => f.severity === 'ERROR')
    const hasWarning = findings.some(f => f.severity === 'WARNING')
    const status: ValidationStatus = hasError ? 'FAILED' : hasWarning ? 'WARNING' : 'PASSED'

    const benchmark: RuntimeBenchmark = {
      baselineMs: baseline,
      executionMs,
      memoryMb: Math.round(memMb * 100) / 100,
      cpuMs: 0,
      providerCalls: (actualOutcome['providerCalls'] as number | undefined) ?? 0,
      networkRequests: (actualOutcome['networkRequests'] as number | undefined) ?? 0,
      tokenCount: 0,
    }

    return this.report(scenario.scenarioId, startedAt, executionMs, status, findings, benchmark)
  }

  private report(
    scenarioId: string, startedAt: string, _executionMs: number,
    status: ValidationStatus, findings: ValidationFinding[],
    benchmark?: RuntimeBenchmark,
  ): RuntimeValidationReport {
    return {
      kind: 'RuntimeValidationReport', schemaVersion: '1.0',
      reportId: randomUUID(), scenarioId, startedAt,
      completedAt: new Date().toISOString(), status,
      benchmark: benchmark ?? { baselineMs: 0, executionMs: 0, memoryMb: 0, cpuMs: 0, providerCalls: 0, networkRequests: 0, tokenCount: 0 },
      findings,
    }
  }
}
