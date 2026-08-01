import { describe, it, expect } from 'vitest'
import type {
  EvaluationGovernanceContext,
  ModelEvaluationGovernanceServiceInterface,
  EvaluationProviderAdapter,
  EvaluationProviderRequest,
  EvaluationProviderResponse,
  EvaluationRequestRepository,
  EvaluationRunRepository,
  NormalizedResultRepository,
  BaselineRepository,
  PromotionDecisionRepository,
  ReviewRepository,
  SupersessionRepository,
  RepositoryWriteResult,
  RepositoryWriteOptions,
  EvaluationGovernanceErrorCode,
  EvaluationGovernanceError,
} from '../../src/index.js'
import {
  makeEvaluationGovernanceError,
  EVALUATION_GOVERNANCE_ERROR_CODES,
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
    const forbidden = ['torch', 'tensorflow', 'keras', 'sklearn', 'sagemaker', 'azureml', 'vertexai']
    for (const k of forbidden) {
      expect(keys.map(s => s.toLowerCase())).not.toContain(k)
    }
  })

  it('no deployment/inference symbols exported', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    const forbidden = ['DeploymentId', 'InferenceRequest', 'DriftSignal', 'RolloutConfig', 'DeploymentRecord']
    for (const k of forbidden) {
      expect(keys).not.toContain(k)
    }
  })

  it('no Stage 11F reimplementation types exported', async () => {
    const mod = await import('../../src/index.js')
    const keys = Object.keys(mod)
    // Stage 11F general evaluator engine types must NOT be re-declared here
    const forbidden = ['EvaluationRequest', 'ObservedOutcome', 'PredictionComparison', 'ExecutionComparison']
    for (const k of forbidden) {
      expect(keys).not.toContain(k)
    }
  })
})

// ── EvaluationGovernanceContext ───────────────────────────────────────────────

describe('EvaluationGovernanceContext', () => {
  it('can construct a valid context', () => {
    const ctx: EvaluationGovernanceContext = {
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

describe('EvaluationGovernanceError taxonomy', () => {
  it('EVALUATION_GOVERNANCE_ERROR_CODES is a non-empty readonly array', () => {
    expect(Array.isArray(EVALUATION_GOVERNANCE_ERROR_CODES)).toBe(true)
    expect(EVALUATION_GOVERNANCE_ERROR_CODES.length).toBeGreaterThan(0)
  })

  it('all codes are unique strings', () => {
    const codes = EVALUATION_GOVERNANCE_ERROR_CODES as readonly string[]
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it('makeEvaluationGovernanceError returns correct shape', () => {
    const err = makeEvaluationGovernanceError('EVALUATION_NO_PROMOTION_AUTHORITY', 'cannot promote')
    expect(err.code).toBe('EVALUATION_NO_PROMOTION_AUTHORITY')
    expect(err.message).toContain('EVALUATION_NO_PROMOTION_AUTHORITY')
    expect(err instanceof Error).toBe(true)
  })

  it('makeEvaluationGovernanceError includes optional detail', () => {
    const err = makeEvaluationGovernanceError('EVALUATION_MISSING_BASELINE', 'no baseline', 'candidate self-baseline rejected')
    expect(err.detail).toBe('candidate self-baseline rejected')
  })

  it('no code duplicates between ml-training error codes and ml-evaluation error codes', async () => {
    const trainingMod = await import('@rohinik-org/ml-training')
    const trainingCodes = new Set(trainingMod.TRAINING_GOVERNANCE_ERROR_CODES as readonly string[])
    for (const code of EVALUATION_GOVERNANCE_ERROR_CODES as readonly string[]) {
      expect(trainingCodes.has(code)).toBe(false)
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
})

// ── EvaluationProviderAdapter boundary ───────────────────────────────────────

describe('EvaluationProviderAdapter boundary', () => {
  it('adapter interface has submit and retrieve', () => {
    // structural conformance: a minimal stub satisfies the interface
    const stub: EvaluationProviderAdapter = {
      adapterId: 'stage11f-adapter',
      submit: async (_req: EvaluationProviderRequest) => ({ submitted: true }),
      retrieveResult: async (_runRef: string) => ({
        runRef: 'run-1',
        outcome: 'PASSED' as const,
        metricValues: [],
      } satisfies EvaluationProviderResponse),
    }
    expect(stub.adapterId).toBe('stage11f-adapter')
  })

  it('adapter cannot promote, deploy, or alter candidates', () => {
    // type-level: EvaluationProviderAdapter has no promotion/deployment methods
    const stub: EvaluationProviderAdapter = {
      adapterId: 'a',
      submit: async () => ({ submitted: true }),
      retrieveResult: async () => ({ runRef: 'r', outcome: 'PASSED', metricValues: [] }),
    }
    expect('promote' in stub).toBe(false)
    expect('deploy' in stub).toBe(false)
    expect('alterCandidate' in stub).toBe(false)
    expect('selfAuthorize' in stub).toBe(false)
  })
})

// ── Clock / IdGenerator / Hasher injection ────────────────────────────────────

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
      hash: (input: string) => `sha256:${'a'.repeat(64)}` as import('@rohinik-org/ml-ir').ContentHash,
    }
    expect(hasher.hash('test')).toMatch(/^sha256:/)
  })
})

// ── ModelEvaluationGovernanceService stub ─────────────────────────────────────

describe('ModelEvaluationGovernanceService', () => {
  it('service factory returns object with required method stubs', () => {
    // ponytail: unknown-typed stubs — typed versions replace these as tasks add concrete types
    const repos = {
      evaluationRequests: { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined } as EvaluationRequestRepository,
      evaluationRuns: { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined } as EvaluationRunRepository,
      normalizedResults: { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined } as NormalizedResultRepository,
      baselines: { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined } as BaselineRepository,
      promotionDecisions: { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined } as PromotionDecisionRepository,
      reviews: { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined } as ReviewRepository,
      supersessions: { save: async () => ({ stored: true, conflict: false }), findById: async () => undefined } as SupersessionRepository,
    }
    const svc = ModelEvaluationGovernanceService({ repos })
    expect(svc).toBeDefined()
  })
})

import { ModelEvaluationGovernanceService } from '../../src/index.js'
