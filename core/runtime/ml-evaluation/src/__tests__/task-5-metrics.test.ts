import { describe, it, expect } from 'vitest'
import type { ContentHash, IsoTimestamp } from '@rohinik-org/ml-ir'
import {
  normalizeMetric,
  buildComparativeResult,
  type NormalizedMetric,
  type MetricNormalizationInput,
  type ComparativeResult,
  type ComparativeResultInput,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = '2024-06-01T12:00:00.000Z' as IsoTimestamp

function makeInput(overrides?: Partial<MetricNormalizationInput>): MetricNormalizationInput {
  return {
    metricId: 'accuracy',
    value: 0.92,
    unit: 'ratio',
    direction: 'HIGHER_IS_BETTER',
    threshold: 0.90,
    ...overrides,
  }
}

// ── normalizeMetric: all directions ──────────────────────────────────────────

describe('normalizeMetric: HIGHER_IS_BETTER', () => {
  it('value above threshold passes', () => {
    const m = normalizeMetric(makeInput({ value: 0.95, threshold: 0.90 }))
    expect(m.pass).toBe(true)
    expect(m.value).toBe(0.95)
  })

  it('value equal to threshold passes', () => {
    const m = normalizeMetric(makeInput({ value: 0.90, threshold: 0.90 }))
    expect(m.pass).toBe(true)
  })

  it('value below threshold fails', () => {
    const m = normalizeMetric(makeInput({ value: 0.85, threshold: 0.90 }))
    expect(m.pass).toBe(false)
  })
})

describe('normalizeMetric: LOWER_IS_BETTER', () => {
  it('value below threshold passes', () => {
    const m = normalizeMetric(makeInput({ direction: 'LOWER_IS_BETTER', value: 0.05, threshold: 0.10 }))
    expect(m.pass).toBe(true)
  })

  it('value equal to threshold passes', () => {
    const m = normalizeMetric(makeInput({ direction: 'LOWER_IS_BETTER', value: 0.10, threshold: 0.10 }))
    expect(m.pass).toBe(true)
  })

  it('value above threshold fails', () => {
    const m = normalizeMetric(makeInput({ direction: 'LOWER_IS_BETTER', value: 0.15, threshold: 0.10 }))
    expect(m.pass).toBe(false)
  })
})

describe('normalizeMetric: TARGET_RANGE', () => {
  it('value within range passes', () => {
    const m = normalizeMetric(makeInput({ direction: 'TARGET_RANGE', value: 0.75, threshold: 0.70, targetRangeMax: 0.80 }))
    expect(m.pass).toBe(true)
  })

  it('value at range min passes', () => {
    const m = normalizeMetric(makeInput({ direction: 'TARGET_RANGE', value: 0.70, threshold: 0.70, targetRangeMax: 0.80 }))
    expect(m.pass).toBe(true)
  })

  it('value below range fails', () => {
    const m = normalizeMetric(makeInput({ direction: 'TARGET_RANGE', value: 0.65, threshold: 0.70, targetRangeMax: 0.80 }))
    expect(m.pass).toBe(false)
  })

  it('value above range fails', () => {
    const m = normalizeMetric(makeInput({ direction: 'TARGET_RANGE', value: 0.85, threshold: 0.70, targetRangeMax: 0.80 }))
    expect(m.pass).toBe(false)
  })
})

// ── non-finite values fail ────────────────────────────────────────────────────

describe('normalizeMetric: non-finite values', () => {
  it('NaN throws EVALUATION_METRIC_NON_FINITE', () => {
    expect(() => normalizeMetric(makeInput({ value: NaN }))).toThrow('EVALUATION_METRIC_NON_FINITE')
  })

  it('Infinity throws EVALUATION_METRIC_NON_FINITE', () => {
    expect(() => normalizeMetric(makeInput({ value: Infinity }))).toThrow('EVALUATION_METRIC_NON_FINITE')
  })

  it('-Infinity throws EVALUATION_METRIC_NON_FINITE', () => {
    expect(() => normalizeMetric(makeInput({ value: -Infinity }))).toThrow('EVALUATION_METRIC_NON_FINITE')
  })
})

// ── unit normalization ────────────────────────────────────────────────────────

describe('normalizeMetric: unit normalization', () => {
  it('percent converted to ratio when threshold is in ratio', () => {
    // 92% = 0.92 ratio; threshold 0.90
    const m = normalizeMetric(makeInput({ value: 92, unit: 'percent', direction: 'HIGHER_IS_BETTER', threshold: 0.90, thresholdUnit: 'ratio' }))
    expect(m.normalizedValue).toBeCloseTo(0.92, 5)
    expect(m.pass).toBe(true)
  })

  it('incompatible units throw EVALUATION_METRIC_UNIT_INCOMPATIBLE', () => {
    expect(() => normalizeMetric(makeInput({ unit: 'milliseconds', thresholdUnit: 'ratio' }))).toThrow('EVALUATION_METRIC_UNIT_INCOMPATIBLE')
  })

  it('same unit requires no conversion', () => {
    const m = normalizeMetric(makeInput({ value: 0.92, unit: 'ratio', threshold: 0.90, thresholdUnit: 'ratio' }))
    expect(m.normalizedValue).toBeCloseTo(0.92, 5)
  })
})

// ── absolute and relative improvement ────────────────────────────────────────

describe('buildComparativeResult: improvement', () => {
  it('absolute improvement calculated correctly', () => {
    const r = buildComparativeResult({
      metricId: 'accuracy',
      candidateValue: 0.93,
      baselineValue: 0.90,
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: 0.01,
      nonRegressionThreshold: 0.0,
    })
    expect(r.absoluteImprovement).toBeCloseTo(0.03, 5)
    expect(r.meetsMinimumImprovement).toBe(true)
  })

  it('candidate below minimum improvement fails meetsMinimumImprovement', () => {
    const r = buildComparativeResult({
      metricId: 'accuracy',
      candidateValue: 0.905,
      baselineValue: 0.90,
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: 0.02,
      nonRegressionThreshold: 0.0,
    })
    expect(r.meetsMinimumImprovement).toBe(false)
  })

  it('relative improvement calculated correctly', () => {
    const r = buildComparativeResult({
      metricId: 'accuracy',
      candidateValue: 0.99,
      baselineValue: 0.90,
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: 0.0,
      nonRegressionThreshold: 0.0,
    })
    expect(r.relativeImprovementPct).toBeCloseTo(10.0, 1)
  })

  it('LOWER_IS_BETTER: lower candidate value = positive improvement', () => {
    const r = buildComparativeResult({
      metricId: 'latency_ms',
      candidateValue: 80,
      baselineValue: 100,
      direction: 'LOWER_IS_BETTER',
      minimumImprovementAbsolute: 0.0,
      nonRegressionThreshold: 0.0,
    })
    expect(r.absoluteImprovement).toBeCloseTo(20, 5)
    expect(r.meetsMinimumImprovement).toBe(true)
  })
})

// ── non-regression ────────────────────────────────────────────────────────────

describe('buildComparativeResult: non-regression', () => {
  it('candidate worse than baseline beyond nonRegressionThreshold throws EVALUATION_METRIC_REGRESSION', () => {
    expect(() => buildComparativeResult({
      metricId: 'accuracy',
      candidateValue: 0.85,
      baselineValue: 0.90,
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: 0.0,
      nonRegressionThreshold: 0.01,
    })).toThrow('EVALUATION_METRIC_REGRESSION')
  })

  it('candidate exactly at nonRegressionThreshold boundary does not throw', () => {
    expect(() => buildComparativeResult({
      metricId: 'accuracy',
      candidateValue: 0.89,
      baselineValue: 0.90,
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: 0.0,
      nonRegressionThreshold: 0.01,
    })).not.toThrow()
  })
})

// ── missing metric handling ───────────────────────────────────────────────────

describe('normalizeMetric: missing metric', () => {
  it('mandatory missing metric throws EVALUATION_METRIC_MISSING', () => {
    expect(() => normalizeMetric(makeInput({ value: undefined as unknown as number, mandatory: true }))).toThrow('EVALUATION_METRIC_MISSING')
  })

  it('optional missing metric returns pass=false without throw', () => {
    const m = normalizeMetric(makeInput({ value: undefined as unknown as number, mandatory: false }))
    expect(m.pass).toBe(false)
    expect(m.missing).toBe(true)
  })
})

// ── confidence / uncertainty ──────────────────────────────────────────────────

describe('normalizeMetric: confidence', () => {
  it('confidence field is carried through', () => {
    const m = normalizeMetric(makeInput({ value: 0.92, confidence: 0.85 }))
    expect(m.confidence).toBeCloseTo(0.85, 5)
  })

  it('confidence defaults to 1 when absent', () => {
    const m = normalizeMetric(makeInput({ value: 0.92 }))
    expect(m.confidence).toBe(1)
  })
})

// ── comparative result hash ───────────────────────────────────────────────────

describe('buildComparativeResult: deterministic hash', () => {
  it('same inputs produce same comparativeHash', () => {
    const input: ComparativeResultInput = {
      metricId: 'accuracy',
      candidateValue: 0.93,
      baselineValue: 0.90,
      direction: 'HIGHER_IS_BETTER',
      minimumImprovementAbsolute: 0.01,
      nonRegressionThreshold: 0.0,
    }
    const r1 = buildComparativeResult(input)
    const r2 = buildComparativeResult(input)
    expect(r1.comparativeHash).toBe(r2.comparativeHash)
    expect(r1.comparativeHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('different candidateValue produces different hash', () => {
    const base: ComparativeResultInput = { metricId: 'accuracy', candidateValue: 0.93, baselineValue: 0.90, direction: 'HIGHER_IS_BETTER', minimumImprovementAbsolute: 0.0, nonRegressionThreshold: 0.0 }
    const r1 = buildComparativeResult({ ...base, candidateValue: 0.93 })
    const r2 = buildComparativeResult({ ...base, candidateValue: 0.94 })
    expect(r1.comparativeHash).not.toBe(r2.comparativeHash)
  })

  it('metric pass does not auto-promote', () => {
    const r = buildComparativeResult({ metricId: 'accuracy', candidateValue: 0.99, baselineValue: 0.90, direction: 'HIGHER_IS_BETTER', minimumImprovementAbsolute: 0.0, nonRegressionThreshold: 0.0 })
    expect('promotionDecision' in r).toBe(false)
  })
})
