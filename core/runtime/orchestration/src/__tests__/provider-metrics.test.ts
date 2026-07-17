import { describe, it, expect } from 'vitest'
import { ProviderMetrics } from '../metrics/provider-metrics.js'

describe('ProviderMetrics', () => {
  it('records calls and increments callCount', () => {
    const m = new ProviderMetrics()
    m.record('p1', true, 100)
    m.record('p1', true, 200)
    expect(m.stats('p1').callCount).toBe(2)
  })

  it('computes average latency', () => {
    const m = new ProviderMetrics()
    m.record('p1', true, 100)
    m.record('p1', true, 300)
    expect(m.stats('p1').avgLatencyMs).toBe(200)
  })

  it('computes average cost', () => {
    const m = new ProviderMetrics()
    m.record('p1', true, 0, 0.01)
    m.record('p1', true, 0, 0.03)
    expect(m.stats('p1').avgCostUsd).toBeCloseTo(0.02)
  })

  it('computes success rate', () => {
    const m = new ProviderMetrics()
    m.record('p1', true, 10)
    m.record('p1', false, 10)
    expect(m.stats('p1').successRate).toBe(0.5)
  })
})
