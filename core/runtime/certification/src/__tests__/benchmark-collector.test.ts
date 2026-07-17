import { describe, it, expect } from 'vitest'
import { collectBenchmark } from '../benchmark/benchmark-collector.js'

describe('collectBenchmark', () => {
  it('withinBaseline true when executionTime ≤ baseline * 1.5', () => {
    expect(collectBenchmark('s1', 100, 200, 50).withinBaseline).toBe(true)
  })
  it('withinBaseline false when executionTime > baseline * 1.5', () => {
    expect(collectBenchmark('s1', 400, 200, 50).withinBaseline).toBe(false)
  })
  it('uses DEFAULT_BASELINE_MS when baseline not provided', () => {
    const bm = collectBenchmark('s1', 100, undefined, 10)
    expect(bm.baselineMs).toBe(5_000)
    expect(bm.withinBaseline).toBe(true)
  })
  it('scenarioId preserved', () => {
    expect(collectBenchmark('my-scenario', 100, 200, 10).scenarioId).toBe('my-scenario')
  })
  it('memoryMb preserved', () => {
    expect(collectBenchmark('s1', 10, 100, 42.5).memoryMb).toBe(42.5)
  })
})
