import { describe, it, expect } from 'vitest'
import type { DeploymentId, ModelId, IsoTimestamp, ContentHash, DriftSignalId } from '@rohinik-org/ml-ir'
import {
  ModelOperationsController,
  type ModelOperationsControllerDeps,
  type OperationsAssessmentRequest,
  type OperationsAssessmentResult,
  type OperationsEvent,
  type OperationsEventBus,
} from '../../src/index.js'
import type { DriftStatisticsOutput } from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const MOD  = 'model-1' as ModelId
const SID  = 'sig-1' as DriftSignalId

function makeDeps(overrides?: Partial<ModelOperationsControllerDeps>): ModelOperationsControllerDeps {
  const noop = async () => { }
  const undef = async () => undefined
  const empty = async () => []

  return {
    signalRepository: { save: noop, find: undef, list: empty },
    assessmentRepository: { save: noop, find: undef, list: empty },
    recommendationRepository: { save: noop, find: undef, list: empty },
    crossStageRequestRepository: { save: noop, find: undef, list: empty },
    driftProvider: {
      computeDriftStatistics: async (_input): Promise<DriftStatisticsOutput> => ({
        driftDetected: true,
        statisticsHash: HASH,
        severity: 'MEDIUM',
        confidenceScore: 0.8,
      }),
    },
    clock: { now: () => NOW },
    idGenerator: (() => { let n = 0; return { nextId: () => `id-${++n}` } })(),
    ...overrides,
  }
}

function makeRequest(overrides?: Partial<OperationsAssessmentRequest>): OperationsAssessmentRequest {
  return {
    deploymentId: DEP,
    modelId: MOD,
    signalId: SID,
    driftType: 'INPUT',
    baselineWindowId: 'w-bl',
    observationWindowId: 'w-obs',
    baselineHash: HASH,
    evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
    requestedAt: NOW,
    requestedBy: 'p',
    ...overrides,
  }
}

// ── ModelOperationsController ─────────────────────────────────────────────────

describe('ModelOperationsController: architecture', () => {
  it('factory returns object with assess method', () => {
    const ctrl = ModelOperationsController(makeDeps())
    expect(typeof ctrl.assess).toBe('function')
  })

  it('no rollback execution methods', () => {
    const ctrl = ModelOperationsController(makeDeps()) as any
    expect('executeRollback' in ctrl).toBe(false)
    expect('rollbackDeployment' in ctrl).toBe(false)
  })

  it('no training execution methods', () => {
    const ctrl = ModelOperationsController(makeDeps()) as any
    expect('submitTrainingRun' in ctrl).toBe(false)
    expect('executeTraining' in ctrl).toBe(false)
  })

  it('no traffic mutation methods', () => {
    const ctrl = ModelOperationsController(makeDeps()) as any
    expect('mutateTraffic' in ctrl).toBe(false)
    expect('setTrafficAllocation' in ctrl).toBe(false)
  })
})

describe('ModelOperationsController: assess', () => {
  it('successful assessment returns ASSESSED outcome', async () => {
    const ctrl = ModelOperationsController(makeDeps())
    const result = await ctrl.assess(makeRequest())
    expect(result.outcome).toBe('ASSESSED')
    expect(result.deploymentId).toBe(DEP)
  })

  it('result has assessmentId and assessmentHash', async () => {
    const ctrl = ModelOperationsController(makeDeps())
    const result = await ctrl.assess(makeRequest())
    expect(result.assessmentId).toBeDefined()
    expect(result.assessmentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('provider failure returns INCONCLUSIVE outcome, not unhandled throw', async () => {
    const ctrl = ModelOperationsController(makeDeps({
      driftProvider: { computeDriftStatistics: async () => { throw new Error('provider crash') } },
    }))
    const result = await ctrl.assess(makeRequest())
    expect(result.outcome).toBe('INCONCLUSIVE')
  })

  it('missing evidenceRef returns FAILED outcome', async () => {
    const ctrl = ModelOperationsController(makeDeps())
    const result = await ctrl.assess(makeRequest({ evidenceRef: undefined as any }))
    expect(result.outcome).toBe('FAILED')
  })
})

describe('ModelOperationsController: events', () => {
  it('emits ASSESSMENT_STARTED and ASSESSMENT_COMPLETED events', async () => {
    const events: OperationsEvent[] = []
    const bus: OperationsEventBus = { emit: async (e) => { events.push(e) } }
    const ctrl = ModelOperationsController({ ...makeDeps(), eventBus: bus })
    await ctrl.assess(makeRequest())
    const types = events.map(e => e.type)
    expect(types).toContain('ASSESSMENT_STARTED')
    expect(types).toContain('ASSESSMENT_COMPLETED')
  })

  it('events contain no raw payload or secrets', async () => {
    const events: OperationsEvent[] = []
    const bus: OperationsEventBus = { emit: async (e) => { events.push(e) } }
    const ctrl = ModelOperationsController({ ...makeDeps(), eventBus: bus })
    await ctrl.assess(makeRequest())
    for (const e of events) {
      expect('payload' in e).toBe(false)
      expect('secret' in e).toBe(false)
      expect('rawData' in e).toBe(false)
    }
  })

  it('events carry deploymentId and type', async () => {
    const events: OperationsEvent[] = []
    const bus: OperationsEventBus = { emit: async (e) => { events.push(e) } }
    const ctrl = ModelOperationsController({ ...makeDeps(), eventBus: bus })
    await ctrl.assess(makeRequest())
    for (const e of events) {
      expect(e.deploymentId).toBe(DEP)
      expect(typeof e.type).toBe('string')
    }
  })
})
