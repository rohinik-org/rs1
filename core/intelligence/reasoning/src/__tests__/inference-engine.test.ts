import { describe, it, expect } from 'vitest'
import { EvidenceCollector } from '../evidence/evidence-collector.js'
import { ProviderLatencyRule, CapabilityFailureRule, NetworkCorrelationRule, PlanningDeficiencyRule } from '../inference/inference-rules.js'
import { InferenceEngine } from '../inference/inference-engine.js'

const collector = new EvidenceCollector()

describe('ProviderLatencyRule', () => {
  it('fires when latency > 3000 and network signal present', () => {
    const set = collector.collect({
      observations: [
        { id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { latencyMs: 5000 } },
        { id: 'o2', timestamp: '2026-01-01T00:00:00Z', signals: { networkLatencyMs: 800 } },
      ],
    })
    const chains = new ProviderLatencyRule().apply(set)
    expect(chains.length).toBe(1)
    expect(chains[0]?.ruleId).toBe('ProviderLatencyRule')
  })

  it('does not fire when latency below threshold', () => {
    const set = collector.collect({ observations: [{ id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { latencyMs: 100, networkLatencyMs: 10 } }] })
    expect(new ProviderLatencyRule().apply(set).length).toBe(0)
  })
})

describe('CapabilityFailureRule', () => {
  it('fires when successRate < 0.5', () => {
    const set = collector.collect({ capabilities: [{ id: 'cap-1', successRate: 0.2 }] })
    const chains = new CapabilityFailureRule().apply(set)
    expect(chains.length).toBe(1)
    expect(chains[0]?.ruleId).toBe('CapabilityFailureRule')
  })

  it('does not fire when successRate >= 0.5', () => {
    const set = collector.collect({ capabilities: [{ id: 'cap-1', successRate: 0.7 }] })
    expect(new CapabilityFailureRule().apply(set).length).toBe(0)
  })
})

describe('NetworkCorrelationRule', () => {
  it('fires when ≥2 failed execs and network signal present', () => {
    const set = collector.collect({
      executions: [{ id: 'e1', success: false, durationMs: 0 }, { id: 'e2', success: false, durationMs: 0 }],
      observations: [{ id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { rtt: 500 } }],
    })
    expect(new NetworkCorrelationRule().apply(set).length).toBe(1)
  })

  it('does not fire with only 1 failed exec', () => {
    const set = collector.collect({
      executions: [{ id: 'e1', success: false, durationMs: 0 }],
      observations: [{ id: 'o1', timestamp: '2026-01-01T00:00:00Z', signals: { rtt: 500 } }],
    })
    expect(new NetworkCorrelationRule().apply(set).length).toBe(0)
  })
})

describe('InferenceEngine', () => {
  it('runs all rules and aggregates chains', () => {
    const set = collector.collect({ capabilities: [{ id: 'c1', successRate: 0.1 }, { id: 'c2', successRate: 0.2 }] })
    const engine = new InferenceEngine()
    const chains = engine.run(set)
    expect(chains.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty array when no rules fire', () => {
    const set = collector.collect({ executions: [{ id: 'e1', success: true, durationMs: 100 }] })
    expect(new InferenceEngine().run(set).length).toBe(0)
  })
})
