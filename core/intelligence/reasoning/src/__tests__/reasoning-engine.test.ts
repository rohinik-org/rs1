import { describe, it, expect } from 'vitest'
import { ReasoningEngine } from '../engine/reasoning-engine.js'
import { NullReasoningStore } from '../store/null-reasoning-store.js'
import { DEFAULT_REASONING_POLICY } from '@rohinik-org/compiler'

function makeEngine() {
  return { engine: new ReasoningEngine(new NullReasoningStore()), store: new NullReasoningStore() }
}

describe('ReasoningEngine', () => {
  it('returns ReasoningReport for empty input', async () => {
    const { engine } = makeEngine()
    const report = await engine.reason({})
    expect(report.kind).toBe('ReasoningReport')
    expect(report.schemaVersion).toBe('1.0')
  })

  it('status is REJECTED for empty evidence (no hypotheses)', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store)
    const report = await engine.reason({})
    expect(report.status).toBe('REJECTED')
  })

  it('persists report to store', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store)
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
    const retrieved = await store.get(report.reportId)
    expect(retrieved?.reportId).toBe(report.reportId)
  })

  it('produces hypotheses for capability failure input', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store)
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
    expect(report.hypothesisSet.length).toBeGreaterThan(0)
  })

  it('selectedHypothesis is hypothesisId of first ranked hypothesis', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store)
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
    if (report.hypothesisSet.length > 0) {
      expect(report.selectedHypothesis).toBe(report.hypothesisSet[0]?.hypothesisId)
    }
  })

  it('status APPROVED when high-confidence hypothesis present', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store, { ...DEFAULT_REASONING_POLICY, minimumConfidence: 0.1 })
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
    expect(report.status).toBe('APPROVED')
  })

  it('status DEFERRED when all hypotheses below minimumConfidence', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store, { ...DEFAULT_REASONING_POLICY, minimumConfidence: 0.99 })
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
    expect(['DEFERRED', 'REJECTED']).toContain(report.status)
  })

  it('inferenceChains present when rules fire', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store)
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.2 }] })
    expect(report.inferenceChains.length).toBeGreaterThan(0)
  })

  it('each recommendation references a hypothesis in hypothesisSet', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store)
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }] })
    const hypothesisIds = new Set(report.hypothesisSet.map(h => h.hypothesisId))
    for (const rec of report.recommendationSet) {
      expect(hypothesisIds.has(rec.hypothesisId)).toBe(true)
    }
  })

  it('does not throw on any input combination', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store)
    await expect(engine.reason({
      observations: [{ id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { latencyMs: 9000, networkLatencyMs: 600 } }],
      executions: [{ id: 'e1', success: false, durationMs: 0 }, { id: 'e2', success: false, durationMs: 0 }],
      capabilities: [{ id: 'c1', successRate: 0.0 }],
    })).resolves.toBeDefined()
  })

  it('maximumHypotheses policy caps hypothesisSet length', async () => {
    const store = new NullReasoningStore()
    const engine = new ReasoningEngine(store, { ...DEFAULT_REASONING_POLICY, maximumHypotheses: 1 })
    const report = await engine.reason({ capabilities: [{ id: 'c1', successRate: 0.1 }, { id: 'c2', successRate: 0.2 }, { id: 'c3', successRate: 0.3 }] })
    expect(report.hypothesisSet.length).toBeLessThanOrEqual(1)
  })
})
