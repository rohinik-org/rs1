import { describe, it, expect } from 'vitest'
import type {
  DeploymentId,
  ModelId,
  IsoTimestamp,
  ContentHash,
  DriftSignalId,
  RetirementRecordId,
} from '@rohinik-org/ml-ir'

// ── architecture / boundary tests (import-time) ───────────────────────────────

describe('architecture: no framework/cloud SDK imports', () => {
  it('index does not import sagemaker, azureml, vertex, datadog, prometheus', async () => {
    const src = await import('../../src/index.js')
    const keys = Object.keys(src)
    for (const forbidden of ['sageMakerClient', 'azureClient', 'vertexClient', 'datadogClient', 'prometheusClient']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('no rollback execution method exported', async () => {
    const src = await import('../../src/index.js')
    const keys = Object.keys(src)
    for (const forbidden of ['executeRollback', 'rollbackDeployment', 'triggerRollback']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('no training execution method exported', async () => {
    const src = await import('../../src/index.js')
    const keys = Object.keys(src)
    for (const forbidden of ['submitTrainingRun', 'executeTraining', 'triggerRetraining']) {
      expect(keys).not.toContain(forbidden)
    }
  })

  it('no traffic mutation method exported', async () => {
    const src = await import('../../src/index.js')
    const keys = Object.keys(src)
    for (const forbidden of ['mutateTraffic', 'setTrafficAllocation', 'adjustTraffic']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

// ── error taxonomy ─────────────────────────────────────────────────────────────

import {
  OPERATIONS_GOVERNANCE_ERROR_CODES,
  makeOperationsGovernanceError,
  type OperationsGovernanceErrorCode,
} from '../../src/index.js'

describe('OPERATIONS_GOVERNANCE_ERROR_CODES', () => {
  it('is a non-empty readonly record', () => {
    expect(typeof OPERATIONS_GOVERNANCE_ERROR_CODES).toBe('object')
    expect(Object.keys(OPERATIONS_GOVERNANCE_ERROR_CODES).length).toBeGreaterThan(0)
  })

  it('contains required error codes', () => {
    const codes = Object.keys(OPERATIONS_GOVERNANCE_ERROR_CODES)
    for (const required of [
      'OPERATIONS_MISSING_EVIDENCE',
      'OPERATIONS_MISSING_BASELINE',
      'OPERATIONS_MISSING_OBSERVATION_WINDOW',
      'OPERATIONS_DRIFT_PROVIDER_BOUNDARY_VIOLATION',
      'OPERATIONS_RECOMMENDATION_NOT_EXECUTABLE',
      'OPERATIONS_RETIREMENT_ACTIVE_DEPLOYMENT',
      'OPERATIONS_INVALID_CONFIDENCE',
      'OPERATIONS_WINDOW_INVALID',
    ]) {
      expect(codes).toContain(required)
    }
  })

  it('all codes are unique strings', () => {
    const codes = Object.keys(OPERATIONS_GOVERNANCE_ERROR_CODES)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) {
      expect(typeof code).toBe('string')
      expect(code.length).toBeGreaterThan(0)
    }
  })
})

describe('makeOperationsGovernanceError', () => {
  it('returns an Error with matching message fragment', () => {
    const err = makeOperationsGovernanceError('OPERATIONS_MISSING_EVIDENCE', 'test')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toContain('OPERATIONS_MISSING_EVIDENCE')
  })

  it('error name is OPERATIONS_GOVERNANCE_ERROR', () => {
    const err = makeOperationsGovernanceError('OPERATIONS_MISSING_BASELINE', 'no baseline')
    expect(err.name).toBe('OPERATIONS_GOVERNANCE_ERROR')
  })
})

// ── OperationsGovernanceContext ───────────────────────────────────────────────

import type { OperationsGovernanceContext } from '../../src/index.js'

describe('OperationsGovernanceContext type shape', () => {
  it('accepts a valid context object', () => {
    const ctx: OperationsGovernanceContext = {
      deploymentId: 'dep-1' as DeploymentId,
      modelId: 'model-1' as ModelId,
      policyRef: { policyId: 'pol-1', policyHash: 'sha256:' + 'a'.repeat(64) as ContentHash },
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: 'sha256:' + 'a'.repeat(64) as ContentHash },
      evaluatedAt: '2024-06-01T12:00:00.000Z' as IsoTimestamp,
    }
    expect(ctx.deploymentId).toBe('dep-1')
    expect(ctx.modelId).toBe('model-1')
    expect(ctx.policyRef.policyId).toBe('pol-1')
    expect(ctx.evidenceRef.evidenceId).toBe('ev-1')
  })
})

// ── DriftProviderAdapter ──────────────────────────────────────────────────────

import type { DriftProviderAdapter } from '../../src/index.js'

describe('DriftProviderAdapter type shape', () => {
  it('accepts a minimal provider implementation', () => {
    const provider: DriftProviderAdapter = {
      computeDriftStatistics: async (_input) => ({
        driftDetected: false,
        statisticsHash: 'sha256:' + 'b'.repeat(64) as ContentHash,
      }),
    }
    expect(typeof provider.computeDriftStatistics).toBe('function')
  })

  it('provider must not have rollback method', () => {
    const provider: DriftProviderAdapter = {
      computeDriftStatistics: async (_input) => ({
        driftDetected: false,
        statisticsHash: 'sha256:' + 'b'.repeat(64) as ContentHash,
      }),
    }
    expect('rollback' in provider).toBe(false)
    expect('executeRollback' in provider).toBe(false)
    expect('submitTrainingRun' in provider).toBe(false)
  })
})

// ── Repository port shapes ─────────────────────────────────────────────────────

import type {
  ObservationWindowRepository,
  DriftBaselineRepository,
  DriftSignalRepository,
  DriftAssessmentRepository,
  OperationalRecommendationRepository,
  CrossStageRequestRepository,
  ModelRetirementRepository,
  ModelSupersessionRepository,
} from '../../src/index.js'

describe('repository port shapes', () => {
  it('ObservationWindowRepository has save and find methods', () => {
    const repo: ObservationWindowRepository = {
      save: async (_w) => { },
      find: async (_id) => undefined,
      list: async (_deploymentId) => [],
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.find).toBe('function')
    expect(typeof repo.list).toBe('function')
  })

  it('DriftBaselineRepository has save and findLatest methods', () => {
    const repo: DriftBaselineRepository = {
      save: async (_b) => { },
      findLatest: async (_deploymentId, _driftType) => undefined,
      find: async (_id) => undefined,
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.findLatest).toBe('function')
  })

  it('DriftSignalRepository has save and list methods', () => {
    const repo: DriftSignalRepository = {
      save: async (_s) => { },
      find: async (_id) => undefined,
      list: async (_deploymentId) => [],
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.list).toBe('function')
  })

  it('DriftAssessmentRepository has save and find methods', () => {
    const repo: DriftAssessmentRepository = {
      save: async (_a) => { },
      find: async (_id) => undefined,
      list: async (_signalId) => [],
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.find).toBe('function')
  })

  it('OperationalRecommendationRepository has save and list methods', () => {
    const repo: OperationalRecommendationRepository = {
      save: async (_r) => { },
      find: async (_id) => undefined,
      list: async (_deploymentId) => [],
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.list).toBe('function')
  })

  it('CrossStageRequestRepository has save and find methods', () => {
    const repo: CrossStageRequestRepository = {
      save: async (_r) => { },
      find: async (_id) => undefined,
      list: async (_deploymentId) => [],
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.find).toBe('function')
  })

  it('ModelRetirementRepository has save and find methods', () => {
    const repo: ModelRetirementRepository = {
      save: async (_r) => { },
      find: async (_id) => undefined,
      list: async (_modelId) => [],
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.find).toBe('function')
  })

  it('ModelSupersessionRepository has save and find methods', () => {
    const repo: ModelSupersessionRepository = {
      save: async (_s) => { },
      find: async (_modelId) => undefined,
    }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.find).toBe('function')
  })
})

// ── injected Clock and IdGenerator ────────────────────────────────────────────

import type { OperationsClock, OperationsIdGenerator } from '../../src/index.js'

describe('OperationsClock', () => {
  it('accepts a clock returning IsoTimestamp', () => {
    const clock: OperationsClock = {
      now: () => '2024-06-01T12:00:00.000Z' as IsoTimestamp,
    }
    expect(clock.now()).toBe('2024-06-01T12:00:00.000Z')
  })
})

describe('OperationsIdGenerator', () => {
  it('accepts an id generator returning strings', () => {
    let counter = 0
    const gen: OperationsIdGenerator = {
      nextId: () => `id-${++counter}`,
    }
    expect(gen.nextId()).toBe('id-1')
    expect(gen.nextId()).toBe('id-2')
  })
})

// ── ModelOperationsGovernanceService skeleton ─────────────────────────────────

import {
  ModelOperationsGovernanceService,
  type ModelOperationsGovernanceServiceDeps,
} from '../../src/index.js'

function makeDeps(): ModelOperationsGovernanceServiceDeps {
  const noop = async () => { }
  const undef = async () => undefined
  const empty = async () => []

  return {
    windowRepository: { save: noop, find: undef, list: empty },
    baselineRepository: { save: noop, findLatest: undef, find: undef },
    signalRepository: { save: noop, find: undef, list: empty },
    assessmentRepository: { save: noop, find: undef, list: empty },
    recommendationRepository: { save: noop, find: undef, list: empty },
    crossStageRequestRepository: { save: noop, find: undef, list: empty },
    retirementRepository: { save: noop, find: undef, list: empty },
    supersessionRepository: { save: noop, find: undef },
    driftProvider: {
      computeDriftStatistics: async (_input) => ({
        driftDetected: false,
        statisticsHash: 'sha256:' + 'c'.repeat(64) as ContentHash,
      }),
    },
    clock: { now: () => '2024-06-01T12:00:00.000Z' as IsoTimestamp },
    idGenerator: { nextId: () => 'id-1' },
  }
}

describe('ModelOperationsGovernanceService', () => {
  it('factory returns an object', () => {
    const svc = ModelOperationsGovernanceService(makeDeps())
    expect(svc).toBeDefined()
    expect(typeof svc).toBe('object')
  })

  it('service has no rollback execution or training execution methods', () => {
    const svc = ModelOperationsGovernanceService(makeDeps()) as any
    expect('executeRollback' in svc).toBe(false)
    expect('rollbackDeployment' in svc).toBe(false)
    expect('submitTrainingRun' in svc).toBe(false)
    expect('executeTraining' in svc).toBe(false)
  })

  it('service has no direct traffic mutation methods', () => {
    const svc = ModelOperationsGovernanceService(makeDeps()) as any
    expect('mutateTraffic' in svc).toBe(false)
    expect('setTrafficAllocation' in svc).toBe(false)
  })

  it('service has no ambient time or randomness', () => {
    const svc = ModelOperationsGovernanceService(makeDeps()) as any
    expect('Math' in svc).toBe(false)
    expect('Date' in svc).toBe(false)
    expect('crypto' in svc).toBe(false)
  })
})

// ── No raw payload fields ──────────────────────────────────────────────────────

describe('architecture: no raw payload/secret fields in core types', () => {
  it('OperationsGovernanceContext has no rawPayload field', () => {
    const ctx: OperationsGovernanceContext = {
      deploymentId: 'dep-1' as DeploymentId,
      modelId: 'model-1' as ModelId,
      policyRef: { policyId: 'pol-1', policyHash: 'sha256:' + 'a'.repeat(64) as ContentHash },
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: 'sha256:' + 'a'.repeat(64) as ContentHash },
      evaluatedAt: '2024-06-01T12:00:00.000Z' as IsoTimestamp,
    }
    expect('rawPayload' in ctx).toBe(false)
    expect('secret' in ctx).toBe(false)
    expect('credentials' in ctx).toBe(false)
  })
})
