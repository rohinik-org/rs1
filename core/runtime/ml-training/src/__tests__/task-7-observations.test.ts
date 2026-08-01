import { describe, it, expect } from 'vitest'
import type { TrainingRunId, ContentHash } from '@rohinik-org/ml-ir'
import type { TrainingIsoTimestamp } from '../../src/index.js'
import {
  recordObservation,
  summarizeRunObservations,
  type TrainingObservationKind,
  type TrainingObservation,
  type MetricObservation,
  type ResourceObservation,
  type ProgressObservation,
  type LogReferenceObservation,
  type WarningObservation,
  type ErrorObservation,
  type ObservationId,
  type ObservationStore,
  type RunObservationSummary,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const RUN = (s: string) => s as TrainingRunId
const H   = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS  = (s: string) => s as TrainingIsoTimestamp
const OID = (s: string) => s as ObservationId

const NOW  = TS('2024-06-01T10:00:00.000Z')
const RUN1 = RUN('run-001')

function makeStore(): ObservationStore {
  return new Map<ObservationId, TrainingObservation>()
}

function metricObs(overrides?: Partial<MetricObservation>): MetricObservation {
  return {
    observationId: OID('obs-001'),
    runId: RUN1,
    kind: 'METRIC',
    sequenceNumber: 1,
    recordedAt: NOW,
    metricName: 'loss',
    metricValue: 0.42,
    step: 100,
    ...overrides,
  } as MetricObservation
}

function resourceObs(overrides?: Partial<ResourceObservation>): ResourceObservation {
  return {
    observationId: OID('obs-r01'),
    runId: RUN1,
    kind: 'RESOURCE',
    sequenceNumber: 2,
    recordedAt: NOW,
    gpuMemoryUsedBytes: 4_294_967_296,
    cpuUtilizationPercent: 75.0,
    ...overrides,
  } as ResourceObservation
}

function progressObs(overrides?: Partial<ProgressObservation>): ProgressObservation {
  return {
    observationId: OID('obs-p01'),
    runId: RUN1,
    kind: 'PROGRESS',
    sequenceNumber: 3,
    recordedAt: NOW,
    currentStep: 100,
    totalSteps: 1000,
    ...overrides,
  } as ProgressObservation
}

function logRefObs(overrides?: Partial<LogReferenceObservation>): LogReferenceObservation {
  return {
    observationId: OID('obs-l01'),
    runId: RUN1,
    kind: 'LOG_REFERENCE',
    sequenceNumber: 4,
    recordedAt: NOW,
    logUri: 's3://bucket/logs/run-001.log',
    logHash: H('log'),
    ...overrides,
  } as LogReferenceObservation
}

function warningObs(overrides?: Partial<WarningObservation>): WarningObservation {
  return {
    observationId: OID('obs-w01'),
    runId: RUN1,
    kind: 'WARNING',
    sequenceNumber: 5,
    recordedAt: NOW,
    warningCode: 'GRADIENT_EXPLOSION',
    description: 'gradient norm exceeded threshold',
    ...overrides,
  } as WarningObservation
}

function errorObs(overrides?: Partial<ErrorObservation>): ErrorObservation {
  return {
    observationId: OID('obs-e01'),
    runId: RUN1,
    kind: 'ERROR',
    sequenceNumber: 6,
    recordedAt: NOW,
    errorCode: 'OOM',
    description: 'out of memory at step 500',
    ...overrides,
  } as ErrorObservation
}

// ── all observation kinds ─────────────────────────────────────────────────────

describe('recordObservation: all kinds register', () => {
  it('METRIC observation inserted', () => {
    const store = makeStore()
    const result = recordObservation(metricObs(), store)
    expect(result.inserted).toBe(true)
    expect(result.observation.kind).toBe('METRIC')
  })

  it('RESOURCE observation inserted', () => {
    const store = makeStore()
    const result = recordObservation(resourceObs(), store)
    expect(result.inserted).toBe(true)
    expect(result.observation.kind).toBe('RESOURCE')
  })

  it('PROGRESS observation inserted', () => {
    const store = makeStore()
    const result = recordObservation(progressObs(), store)
    expect(result.inserted).toBe(true)
    expect(result.observation.kind).toBe('PROGRESS')
  })

  it('LOG_REFERENCE observation inserted', () => {
    const store = makeStore()
    const result = recordObservation(logRefObs(), store)
    expect(result.inserted).toBe(true)
    expect(result.observation.kind).toBe('LOG_REFERENCE')
  })

  it('WARNING observation inserted', () => {
    const store = makeStore()
    const result = recordObservation(warningObs(), store)
    expect(result.inserted).toBe(true)
    expect(result.observation.kind).toBe('WARNING')
  })

  it('ERROR observation inserted', () => {
    const store = makeStore()
    const result = recordObservation(errorObs(), store)
    expect(result.inserted).toBe(true)
    expect(result.observation.kind).toBe('ERROR')
  })
})

// ── observation hash ──────────────────────────────────────────────────────────

describe('observation hash', () => {
  it('each observation has observationHash matching sha256 pattern', () => {
    const store = makeStore()
    const result = recordObservation(metricObs(), store)
    expect(result.observation.observationHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('same input → same hash (deterministic)', () => {
    const s1 = makeStore()
    const s2 = makeStore()
    const h1 = recordObservation(metricObs(), s1).observation.observationHash
    const h2 = recordObservation(metricObs(), s2).observation.observationHash
    expect(h1).toBe(h2)
  })

  it('different metricValue → different hash', () => {
    const s1 = makeStore()
    const s2 = makeStore()
    const h1 = recordObservation(metricObs({ metricValue: 0.1 }), s1).observation.observationHash
    const h2 = recordObservation(metricObs({ metricValue: 0.9, observationId: OID('obs-002') }), s2).observation.observationHash
    expect(h1).not.toBe(h2)
  })
})

// ── duplicate id / sequence enforcement ──────────────────────────────────────

describe('duplicate enforcement', () => {
  it('idempotent: same observation twice → inserted=false, idempotent=true', () => {
    const store = makeStore()
    recordObservation(metricObs(), store)
    const r2 = recordObservation(metricObs(), store)
    expect(r2.inserted).toBe(false)
    expect(r2.idempotent).toBe(true)
    expect(r2.conflict).toBe(false)
  })

  it('conflict: same id, different value → conflict=true', () => {
    const store = makeStore()
    recordObservation(metricObs(), store)
    const r2 = recordObservation(metricObs({ metricValue: 0.99 }), store)
    expect(r2.conflict).toBe(true)
    expect(r2.inserted).toBe(false)
  })

  it('sequence must be monotonically non-decreasing per run', () => {
    const store = makeStore()
    recordObservation(metricObs({ sequenceNumber: 5 }), store)
    expect(() => recordObservation(metricObs({ observationId: OID('obs-002'), sequenceNumber: 3 }), store))
      .toThrow(/TRAINING_OBSERVATION_SEQUENCE_ERROR/)
  })

  it('sequence is independent across runs', () => {
    const store = makeStore()
    recordObservation(metricObs({ runId: RUN('run-A'), sequenceNumber: 10 }), store)
    expect(() => recordObservation(metricObs({ observationId: OID('obs-002'), runId: RUN('run-B'), sequenceNumber: 1 }), store))
      .not.toThrow()
  })
})

// ── metric validation ─────────────────────────────────────────────────────────

describe('metric validation', () => {
  it('rejects non-finite metric value (Infinity)', () => {
    const store = makeStore()
    expect(() => recordObservation(metricObs({ metricValue: Infinity }), store))
      .toThrow(/TRAINING_OBSERVATION_INVALID/)
  })

  it('rejects NaN metric value', () => {
    const store = makeStore()
    expect(() => recordObservation(metricObs({ metricValue: NaN }), store))
      .toThrow(/TRAINING_OBSERVATION_INVALID/)
  })

  it('accepts negative metric value (valid for some metrics like log-likelihood)', () => {
    const store = makeStore()
    expect(() => recordObservation(metricObs({ metricValue: -2.5 }), store)).not.toThrow()
  })
})

// ── resource validation ───────────────────────────────────────────────────────

describe('resource validation', () => {
  it('rejects negative gpuMemoryUsedBytes', () => {
    const store = makeStore()
    expect(() => recordObservation(resourceObs({ gpuMemoryUsedBytes: -1 }), store))
      .toThrow(/TRAINING_OBSERVATION_INVALID/)
  })

  it('rejects negative cpuUtilizationPercent', () => {
    const store = makeStore()
    expect(() => recordObservation(resourceObs({ cpuUtilizationPercent: -5 }), store))
      .toThrow(/TRAINING_OBSERVATION_INVALID/)
  })

  it('accepts zero resource usage', () => {
    const store = makeStore()
    expect(() => recordObservation(resourceObs({ gpuMemoryUsedBytes: 0, cpuUtilizationPercent: 0 }), store)).not.toThrow()
  })
})

// ── raw data sentinel ─────────────────────────────────────────────────────────

describe('raw data sentinel', () => {
  it('rejects observation with rawData field', () => {
    const store = makeStore()
    const bad = { ...metricObs(), rawData: { rows: [1, 2, 3] } }
    expect(() => recordObservation(bad as unknown as MetricObservation, store))
      .toThrow(/TRAINING_OBSERVATION_RAW_DATA/)
  })
})

// ── ordering ──────────────────────────────────────────────────────────────────

describe('ordering', () => {
  it('summarizeRunObservations returns observations ordered by sequenceNumber', () => {
    const store = makeStore()
    recordObservation(metricObs({ sequenceNumber: 1, observationId: OID('obs-1') }), store)
    recordObservation(resourceObs({ sequenceNumber: 2, observationId: OID('obs-2') }), store)
    recordObservation(progressObs({ sequenceNumber: 3, observationId: OID('obs-3') }), store)
    const summary = summarizeRunObservations(RUN1, store)
    const seqs = summary.observations.map(o => o.sequenceNumber)
    expect(seqs).toEqual([1, 2, 3])
  })
})

// ── summarizeRunObservations ──────────────────────────────────────────────────

describe('summarizeRunObservations', () => {
  it('count reflects inserted observations', () => {
    const store = makeStore()
    recordObservation(metricObs({ observationId: OID('obs-1'), sequenceNumber: 1 }), store)
    recordObservation(metricObs({ observationId: OID('obs-2'), sequenceNumber: 2, metricName: 'accuracy', metricValue: 0.9 }), store)
    const summary = summarizeRunObservations(RUN1, store)
    expect(summary.totalCount).toBe(2)
  })

  it('summary only includes observations for the target run', () => {
    const store = makeStore()
    recordObservation(metricObs({ runId: RUN1, sequenceNumber: 1 }), store)
    recordObservation(metricObs({ runId: RUN('run-999'), observationId: OID('obs-x'), sequenceNumber: 1 }), store)
    const summary = summarizeRunObservations(RUN1, store)
    expect(summary.totalCount).toBe(1)
    expect(summary.observations.every(o => o.runId === RUN1)).toBe(true)
  })

  it('summary has summaryHash', () => {
    const store = makeStore()
    recordObservation(metricObs(), store)
    const summary = summarizeRunObservations(RUN1, store)
    expect(summary.summaryHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('summaryHash is deterministic for same observations', () => {
    const s1 = makeStore()
    const s2 = makeStore()
    recordObservation(metricObs(), s1)
    recordObservation(metricObs(), s2)
    const h1 = summarizeRunObservations(RUN1, s1).summaryHash
    const h2 = summarizeRunObservations(RUN1, s2).summaryHash
    expect(h1).toBe(h2)
  })

  it('empty run summary has totalCount=0', () => {
    const store = makeStore()
    const summary = summarizeRunObservations(RUN('no-such-run'), store)
    expect(summary.totalCount).toBe(0)
    expect(summary.observations).toHaveLength(0)
  })
})

// ── immutability ──────────────────────────────────────────────────────────────

describe('observation immutability', () => {
  it('returned observation has no mutable methods', () => {
    const store = makeStore()
    const { observation } = recordObservation(metricObs(), store)
    expect(typeof (observation as unknown as Record<string, unknown>)['update']).not.toBe('function')
    expect(typeof (observation as unknown as Record<string, unknown>)['delete']).not.toBe('function')
  })
})
