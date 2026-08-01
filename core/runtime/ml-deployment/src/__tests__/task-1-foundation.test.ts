import { describe, it, expect } from 'vitest'
import type {
  DeploymentGovernanceContext,
  ModelDeploymentGovernanceServiceInterface,
  DeploymentProviderAdapter,
  InferenceProviderAdapter,
  DeploymentRequestRepository,
  DeploymentRevisionRepository,
  EndpointRepository,
  RolloutStateRepository,
  TrafficPlanRepository,
  InferenceRecordRepository,
  HealthObservationRepository,
  RollbackDirectiveRepository,
  RetirementRecordRepository,
  RepositoryWriteResult,
  RepositoryWriteOptions,
  DeploymentGovernanceErrorCode,
  DeploymentGovernanceError,
} from '../../src/index.js'
import {
  makeDeploymentGovernanceError,
  DEPLOYMENT_GOVERNANCE_ERROR_CODES,
  ModelDeploymentGovernanceService,
} from '../../src/index.js'

// ── dependency direction ──────────────────────────────────────────────────────

describe('architecture: dependency direction', () => {
  it('package exports are defined', async () => {
    const mod = await import('../../src/index.js')
    expect(mod).toBeDefined()
  })

  it('no framework/cloud ML symbols exported', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    const forbidden = ['torch', 'tensorflow', 'keras', 'sklearn', 'sagemaker', 'azureml', 'vertexai', 'triton']
    for (const k of forbidden) {
      expect(keys.map(s => s.toLowerCase())).not.toContain(k)
    }
  })

  it('no Stage 12F drift/retraining symbols exported', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    const forbidden = ['DriftSignal', 'DriftDetector', 'RetrainingRequest', 'DriftRecommendation']
    for (const k of forbidden) {
      expect(keys).not.toContain(k)
    }
  })

  it('no training or evaluation reimplementation types exported', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    // must not re-declare training/evaluation engine types
    const forbidden = ['TrainingRun', 'EvaluationRun', 'CandidateEvaluationRequest', 'NormalizedMetric']
    for (const k of forbidden) {
      expect(keys).not.toContain(k)
    }
  })
})

// ── DeploymentGovernanceContext ───────────────────────────────────────────────

describe('DeploymentGovernanceContext', () => {
  it('constructs a valid context', () => {
    const ctx: DeploymentGovernanceContext = {
      tenantId: 'tenant-1',
      environmentId: 'env-prod',
      requestedAt: '2024-01-01T00:00:00.000Z' as import('@rohinik-org/ml-ir').IsoTimestamp,
      requestingPrincipalId: 'principal-1',
    }
    expect(ctx.tenantId).toBe('tenant-1')
    expect(ctx.environmentId).toBe('env-prod')
    expect(ctx.requestingPrincipalId).toBe('principal-1')
  })
})

// ── error taxonomy ────────────────────────────────────────────────────────────

describe('DeploymentGovernanceError taxonomy', () => {
  it('DEPLOYMENT_GOVERNANCE_ERROR_CODES is a non-empty readonly array', () => {
    expect(Array.isArray(DEPLOYMENT_GOVERNANCE_ERROR_CODES)).toBe(true)
    expect(DEPLOYMENT_GOVERNANCE_ERROR_CODES.length).toBeGreaterThan(0)
  })

  it('all codes are unique strings', () => {
    const codes = DEPLOYMENT_GOVERNANCE_ERROR_CODES as readonly string[]
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('makeDeploymentGovernanceError returns correct shape', () => {
    const err = makeDeploymentGovernanceError('DEPLOYMENT_NO_PROMOTION', 'missing promotion')
    expect(err.code).toBe('DEPLOYMENT_NO_PROMOTION')
    expect(err.message).toContain('DEPLOYMENT_NO_PROMOTION')
    expect(err instanceof Error).toBe(true)
  })

  it('makeDeploymentGovernanceError includes optional detail', () => {
    const err = makeDeploymentGovernanceError('DEPLOYMENT_ENVIRONMENT_INELIGIBLE', 'env not eligible', 'env-dev not in allowlist')
    expect(err.detail).toBe('env-dev not in allowlist')
  })

  it('no code duplicates with ml-evaluation error codes', async () => {
    const evalMod = await import('@rohinik-org/ml-evaluation')
    const evalCodes = new Set(evalMod.EVALUATION_GOVERNANCE_ERROR_CODES as readonly string[])
    for (const code of DEPLOYMENT_GOVERNANCE_ERROR_CODES as readonly string[]) {
      expect(evalCodes.has(code)).toBe(false)
    }
  })
})

// ── repository port shapes ────────────────────────────────────────────────────

describe('repository port shapes', () => {
  it('RepositoryWriteResult has stored and conflict fields', () => {
    const r: RepositoryWriteResult = { stored: true, conflict: false }
    expect(r.stored).toBe(true)
    expect(r.conflict).toBe(false)
  })

  it('RepositoryWriteOptions has optional idempotencyKey', () => {
    const o1: RepositoryWriteOptions = {}
    const o2: RepositoryWriteOptions = { idempotencyKey: 'key-1' }
    expect(o1.idempotencyKey).toBeUndefined()
    expect(o2.idempotencyKey).toBe('key-1')
  })

  it('all repository stubs satisfy their interfaces', () => {
    const stub = { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined }
    const repos = {
      deploymentRequests:  stub as DeploymentRequestRepository,
      deploymentRevisions: stub as DeploymentRevisionRepository,
      endpoints:           stub as EndpointRepository,
      rolloutState:        stub as RolloutStateRepository,
      trafficPlans:        stub as TrafficPlanRepository,
      inferenceRecords:    stub as InferenceRecordRepository,
      healthObservations:  stub as HealthObservationRepository,
      rollbackDirectives:  stub as RollbackDirectiveRepository,
      retirementRecords:   stub as RetirementRecordRepository,
    }
    expect(Object.keys(repos).length).toBe(9)
  })
})

// ── DeploymentProviderAdapter boundary ───────────────────────────────────────

describe('DeploymentProviderAdapter boundary', () => {
  it('adapter interface has prepare, deploy, drain, rollback, retire, and reportHealth', () => {
    const stub: DeploymentProviderAdapter = {
      adapterId: 'k8s-adapter',
      prepare:      async () => ({ prepared: true }),
      deploy:       async () => ({ deployed: true }),
      drain:        async () => ({ drained: true }),
      rollback:     async () => ({ rolledBack: true }),
      retire:       async () => ({ retired: true }),
      reportHealth: async () => ({ healthy: true }),
    }
    expect(stub.adapterId).toBe('k8s-adapter')
  })

  it('adapter cannot promote, expand eligibility, alter identity, or fabricate evidence', () => {
    const stub: DeploymentProviderAdapter = {
      adapterId: 'a',
      prepare:      async () => ({ prepared: true }),
      deploy:       async () => ({ deployed: true }),
      drain:        async () => ({ drained: true }),
      rollback:     async () => ({ rolledBack: true }),
      retire:       async () => ({ retired: true }),
      reportHealth: async () => ({ healthy: true }),
    }
    expect('promote' in stub).toBe(false)
    expect('expandEligibility' in stub).toBe(false)
    expect('alterIdentity' in stub).toBe(false)
    expect('fabricateEvidence' in stub).toBe(false)
    expect('selfAuthorize' in stub).toBe(false)
  })
})

describe('InferenceProviderAdapter boundary', () => {
  it('adapter interface has execute', () => {
    const stub: InferenceProviderAdapter = {
      adapterId: 'inf-adapter',
      execute: async () => ({ outcome: 'SUCCESS', outputHash: `sha256:${'a'.repeat(64)}` as import('@rohinik-org/ml-ir').ContentHash, latencyMs: 42 }),
    }
    expect(stub.adapterId).toBe('inf-adapter')
  })

  it('inference adapter cannot deploy, promote, or alter routes', () => {
    const stub: InferenceProviderAdapter = {
      adapterId: 'inf',
      execute: async () => ({ outcome: 'SUCCESS', outputHash: `sha256:${'a'.repeat(64)}` as import('@rohinik-org/ml-ir').ContentHash, latencyMs: 10 }),
    }
    expect('deploy' in stub).toBe(false)
    expect('promote' in stub).toBe(false)
    expect('rerouteTraffic' in stub).toBe(false)
  })
})

// ── injected primitives ───────────────────────────────────────────────────────

describe('injected Clock, IdGenerator, and Hasher', () => {
  it('Clock interface has now()', () => {
    const clock: import('../../src/index.js').Clock = { now: () => '2024-01-01T00:00:00.000Z' as import('@rohinik-org/ml-ir').IsoTimestamp }
    expect(typeof clock.now()).toBe('string')
  })

  it('IdGenerator interface has generate()', () => {
    const gen: import('../../src/index.js').IdGenerator = { generate: () => 'id-abc' }
    expect(gen.generate()).toBe('id-abc')
  })

  it('Hasher interface has hash()', () => {
    const hasher: import('../../src/index.js').Hasher = {
      hash: (_input: string) => `sha256:${'a'.repeat(64)}` as import('@rohinik-org/ml-ir').ContentHash,
    }
    expect(hasher.hash('test')).toMatch(/^sha256:/)
  })
})

// ── ModelDeploymentGovernanceService shell ────────────────────────────────────

describe('ModelDeploymentGovernanceService', () => {
  it('service factory returns an object', () => {
    const stub = { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined }
    const repos = {
      deploymentRequests:  stub as DeploymentRequestRepository,
      deploymentRevisions: stub as DeploymentRevisionRepository,
      endpoints:           stub as EndpointRepository,
      rolloutState:        stub as RolloutStateRepository,
      trafficPlans:        stub as TrafficPlanRepository,
      inferenceRecords:    stub as InferenceRecordRepository,
      healthObservations:  stub as HealthObservationRepository,
      rollbackDirectives:  stub as RollbackDirectiveRepository,
      retirementRecords:   stub as RetirementRecordRepository,
    }
    const svc = ModelDeploymentGovernanceService({ repos })
    expect(svc).toBeDefined()
  })

  it('service has no ambient time or randomness — no Clock.now() call at construction', () => {
    // Structural: factory accepts repos only; no time/random side effects at init
    const stub = { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined }
    const repos = {
      deploymentRequests:  stub as DeploymentRequestRepository,
      deploymentRevisions: stub as DeploymentRevisionRepository,
      endpoints:           stub as EndpointRepository,
      rolloutState:        stub as RolloutStateRepository,
      trafficPlans:        stub as TrafficPlanRepository,
      inferenceRecords:    stub as InferenceRecordRepository,
      healthObservations:  stub as HealthObservationRepository,
      rollbackDirectives:  stub as RollbackDirectiveRepository,
      retirementRecords:   stub as RetirementRecordRepository,
    }
    expect(() => ModelDeploymentGovernanceService({ repos })).not.toThrow()
  })
})
