import type { CertificationBenchmark } from '@rohinik-org/compiler'

const DEFAULT_BASELINE_MS = 5_000

export function collectBenchmark(scenarioId: string, executionTimeMs: number, baselineMs: number | undefined, memMb: number): CertificationBenchmark {
  const baseline = baselineMs ?? DEFAULT_BASELINE_MS
  return {
    scenarioId,
    executionTimeMs,
    baselineMs: baseline,
    memoryMb: memMb,
    cpuPercent: 0,
    withinBaseline: executionTimeMs <= baseline * 1.5,
  }
}
