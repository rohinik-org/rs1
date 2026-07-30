export type ScenarioId =
  | 'trusted-package'
  | 'conditionally-trusted'
  | 'manual-review'
  | 'denied-integrity'
  | 'denied-revoked'
  | 'revocation-after-trust'
  | 'vulnerability-after-trust'
  | 'artifact-replacement'
  | 'quarantine-failure'
  | 'stale-authorization'
  | 'replay-after-failure'
  | 'concurrent-operations'

export type ScenarioOutcome = 'passed' | 'failed'

export interface ScenarioResult {
  readonly scenarioId: ScenarioId
  readonly outcome: ScenarioOutcome
  readonly durationMs: number
  readonly detail?: string
}

export interface ScenarioRunnerResult {
  readonly passed: readonly ScenarioResult[]
  readonly failed: readonly ScenarioResult[]
  readonly totalCount: number
  readonly passCount: number
  readonly failCount: number
}

export async function runScenario<T>(
  scenarioId: ScenarioId,
  fn: () => Promise<T>,
): Promise<{ result: ScenarioResult; value: T | undefined }> {
  const start = Date.now()
  try {
    const value = await fn()
    return {
      result: { scenarioId, outcome: 'passed', durationMs: Date.now() - start },
      value,
    }
  } catch (err) {
    return {
      result: {
        scenarioId,
        outcome: 'failed',
        durationMs: Date.now() - start,
        detail: String(err),
      },
      value: undefined,
    }
  }
}
