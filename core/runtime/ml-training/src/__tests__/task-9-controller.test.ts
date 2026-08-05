import { describe, it, expect, vi } from 'vitest'
import type { TrainingRunId, ExperimentId, ContentHash } from '@rohinik-org/ml-ir'
import type { TrainingIsoTimestamp } from '../../src/index.js'
import {
  createTrainingController,
  type TrainingControllerConfig,
  type TrainingControllerRequest,
  type TrainingControllerResponse,
  type TrainingEvent,
  type TrainingEventBus,
  type TrainingProvider,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const RUN = (s: string) => s as TrainingRunId
const EXP = (s: string) => s as ExperimentId
const H   = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS  = (s: string) => s as TrainingIsoTimestamp

const NOW = TS('2024-06-01T10:00:00.000Z')

function makeEventBus(): TrainingEventBus & { events: TrainingEvent[] } {
  const events: TrainingEvent[] = []
  return {
    events,
    emit(event: TrainingEvent) { events.push(event) },
  }
}

function makeSuccessProvider() {
  return {
    providerId: 'mock-provider',
    prepare: vi.fn(async () => ({ prepared: true })),
    start: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    reportOutcome: vi.fn(async (runId: TrainingRunId) => ({
      runId,
      outcome: 'SUCCEEDED' as const,
      outputArtifactRef: { uri: 's3://bucket/model.tar.gz', contentHash: H('model') },
    })),
  }
}

function makeFailureProvider(): TrainingProvider {
  return {
    providerId: 'mock-provider',
    prepare: vi.fn(async () => ({ prepared: true })),
    start: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    reportOutcome: vi.fn(async (runId: TrainingRunId) => ({
      runId,
      outcome: 'FAILED' as const,
    })),
  }
}

function baseRequest(): TrainingControllerRequest {
  return {
    runId: RUN('run-ctrl-001'),
    experimentId: EXP('exp-001'),
    submissionId: 'sub-001',
    submissionHash: H('sub'),
    environmentHash: H('env'),
    reproducibilityDisclosureHash: H('repro'),
    featureSchemaId: 'schema-1' as never,
    featureSchemaVersion: 'v1',
    datasetBindings: [{ datasetId: 'ds-1' as never, version: 'v1' }],
    requestedAt: NOW,
  }
}

// ── dependency direction sentinel ─────────────────────────────────────────────

describe('architecture: dependency direction', () => {
  it('createTrainingController is exported', async () => {
    const mod = await import('../../src/index.js')
    expect(typeof mod.createTrainingController).toBe('function')
  })

  it('no cloud SDK in exports', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod).map(k => k.toLowerCase())
    for (const forbidden of ['sagemaker', 'azureml', 'vertexai', 'tensorflow', 'torch']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

// ── success flow ──────────────────────────────────────────────────────────────

describe('TrainingController: success', () => {
  it('returns SUCCEEDED outcome', async () => {
    const bus = makeEventBus()
    const provider = makeSuccessProvider()
    const controller = createTrainingController({ provider, eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.outcome).toBe('SUCCEEDED')
  })

  it('response has runId matching request', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.runId).toBe(RUN('run-ctrl-001'))
  })

  it('success response has candidateArtifact', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.candidateArtifact).toBeDefined()
    expect(response.candidateArtifact?.lifecycleState).toBe('CANDIDATE')
  })

  it('success response has no promotionDecisionId or deploymentId', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    const response = await controller.execute(baseRequest())
    const keys = Object.keys(response)
    expect(keys).not.toContain('promotionDecisionId')
    expect(keys).not.toContain('deploymentId')
  })

  it('success response has evidenceHash', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.evidenceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

// ── provider failure ──────────────────────────────────────────────────────────

describe('TrainingController: provider failure', () => {
  it('returns FAILED outcome when provider reports failure', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeFailureProvider(), eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.outcome).toBe('FAILED')
  })

  it('FAILED response has no candidateArtifact', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeFailureProvider(), eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.candidateArtifact).toBeUndefined()
  })

  it('FAILED response still has evidenceHash', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeFailureProvider(), eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.evidenceHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

// ── cancellation ──────────────────────────────────────────────────────────────

describe('TrainingController: cancellation', () => {
  it('cancel() produces CANCELLED outcome', async () => {
    const cancelProvider = {
      ...makeSuccessProvider(),
      reportOutcome: vi.fn(async (runId: TrainingRunId) => ({
        runId,
        outcome: 'CANCELLED' as const,
      })),
    }
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: cancelProvider, eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.outcome).toBe('CANCELLED')
    expect(response.candidateArtifact).toBeUndefined()
  })
})

// ── event bus ─────────────────────────────────────────────────────────────────

describe('TrainingController: events', () => {
  it('emits at least one event on success', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    await controller.execute(baseRequest())
    expect(bus.events.length).toBeGreaterThan(0)
  })

  it('events have runId field', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    await controller.execute(baseRequest())
    for (const event of bus.events) {
      expect(event.runId).toBe(RUN('run-ctrl-001'))
    }
  })

  it('events contain no rawData field', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    await controller.execute(baseRequest())
    for (const event of bus.events) {
      expect(Object.keys(event)).not.toContain('rawData')
    }
  })

  it('events are ordered by sequenceNumber', async () => {
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: makeSuccessProvider(), eventBus: bus })
    await controller.execute(baseRequest())
    const seqs = bus.events.map(e => e.sequenceNumber)
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!)
    }
  })
})

// ── provider exception ────────────────────────────────────────────────────────

describe('TrainingController: provider exception', () => {
  it('provider throw produces FAILED outcome (does not propagate exception)', async () => {
    const throwingProvider = {
      ...makeSuccessProvider(),
      reportOutcome: vi.fn(async () => { throw new Error('provider crashed') }),
    }
    const bus = makeEventBus()
    const controller = createTrainingController({ provider: throwingProvider, eventBus: bus })
    const response = await controller.execute(baseRequest())
    expect(response.outcome).toBe('FAILED')
  })
})

// ── evidence seal ─────────────────────────────────────────────────────────────

describe('TrainingController: evidence', () => {
  it('evidenceHash is deterministic for same inputs', async () => {
    const controller1 = createTrainingController({ provider: makeSuccessProvider(), eventBus: makeEventBus() })
    const controller2 = createTrainingController({ provider: makeSuccessProvider(), eventBus: makeEventBus() })
    const r1 = await controller1.execute(baseRequest())
    const r2 = await controller2.execute(baseRequest())
    expect(r1.evidenceHash).toBe(r2.evidenceHash)
  })
})
