import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'

// ── imports — all must resolve after implementation ───────────────────────────
import {
  // Error taxonomy
  GOVERNED_LEARNING_ERROR_CODES,
  GovernedLearningError,
  makeGovernedLearningError,
  type GovernedLearningErrorCode,

  // Branded IDs
  type AdaptationId,
  type AdaptationVersionId,
  type ProposalId,
  type BaselineId,
  type EvaluationId,
  type AdmissionId,
  type DeploymentId,
  type ObservationId,
  type RollbackId,
  type SupersessionId,

  // Adaptation kinds
  ADAPTATION_KINDS,
  type AdaptationKind,

  // Ports
  type AdaptationRepository,
  type AdaptationVersionRepository,
  type ProposalRepository,
  type BaselineRepository,
  type EvaluationRepository,
  type AdmissionRepository,
  type DeploymentRepository,
  type ObservationRepository,
  type RollbackRepository,
  type SupersessionRepository,

  // Cross-stage read-only ports
  type ExecutionEvidencePort,
  type EvaluationEvidencePort,
  type ReliabilityEvidencePort,
  type RoutingEvidencePort,
  type EconomicsEvidencePort,
  type PolicyEvidencePort,

  // Owner-controller command ports
  type OwnerControllerCommandPort,

  // Utilities
  type GovernedLearningClock,
  type GovernedLearningIdGenerator,
  type GovernedLearningHasher,
} from '../../src/index.js'

const NOW = '2024-06-01T12:00:00.000Z' as IsoTimestamp

// ── Error taxonomy ─────────────────────────────────────────────────────────────

describe('GOVERNED_LEARNING_ERROR_CODES', () => {
  it('all required codes exist', () => {
    const codes = Object.keys(GOVERNED_LEARNING_ERROR_CODES)
    expect(codes).toContain('GOVERNED_LEARNING_MISSING_EVIDENCE')
    expect(codes).toContain('GOVERNED_LEARNING_MISSING_BASELINE')
    expect(codes).toContain('GOVERNED_LEARNING_SELF_EVALUATION')
    expect(codes).toContain('GOVERNED_LEARNING_SELF_EVIDENCE')
    expect(codes).toContain('GOVERNED_LEARNING_ADMISSION_REQUIRED')
    expect(codes).toContain('GOVERNED_LEARNING_EVALUATION_REQUIRED')
    expect(codes).toContain('GOVERNED_LEARNING_DEPLOYMENT_REQUIRED')
    expect(codes).toContain('GOVERNED_LEARNING_OBSERVATION_REQUIRED')
    expect(codes).toContain('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE')
    expect(codes).toContain('GOVERNED_LEARNING_SCOPE_EXPANSION')
    expect(codes).toContain('GOVERNED_LEARNING_DIRECT_MUTATION')
    expect(codes).toContain('GOVERNED_LEARNING_VENDOR_AUTHORITY')
    expect(codes).toContain('GOVERNED_LEARNING_TERMINAL_RECORD')
    expect(codes).toContain('GOVERNED_LEARNING_OWNER_WRITE_FORBIDDEN')
  })

  it('all codes unique', () => {
    const codes = Object.values(GOVERNED_LEARNING_ERROR_CODES)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('GovernedLearningError', () => {
  it('is an Error', () => {
    const e = new GovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'test')
    expect(e).toBeInstanceOf(Error)
  })

  it('name is GOVERNED_LEARNING_ERROR', () => {
    const e = new GovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'test')
    expect(e.name).toBe('GOVERNED_LEARNING_ERROR')
  })

  it('message includes code', () => {
    const e = new GovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'no evidence')
    expect(e.message).toContain('GOVERNED_LEARNING_MISSING_EVIDENCE')
    expect(e.message).toContain('no evidence')
  })

  it('makeGovernedLearningError returns GovernedLearningError', () => {
    const e = makeGovernedLearningError('GOVERNED_LEARNING_SELF_EVALUATION', 'self eval')
    expect(e).toBeInstanceOf(GovernedLearningError)
    expect(e.code).toBe('GOVERNED_LEARNING_SELF_EVALUATION')
  })
})

// ── Adaptation kinds ───────────────────────────────────────────────────────────

describe('ADAPTATION_KINDS', () => {
  it('all eight kinds present', () => {
    expect(ADAPTATION_KINDS).toContain('ROUTING_POLICY')
    expect(ADAPTATION_KINDS).toContain('PLANNING_POLICY')
    expect(ADAPTATION_KINDS).toContain('ECONOMICS_CALIBRATION')
    expect(ADAPTATION_KINDS).toContain('RELIABILITY_WEIGHTING')
    expect(ADAPTATION_KINDS).toContain('PROMPT_POLICY')
    expect(ADAPTATION_KINDS).toContain('AGENT_POLICY')
    expect(ADAPTATION_KINDS).toContain('EXECUTION_POLICY')
    expect(ADAPTATION_KINDS).toContain('LEARNED_OPTIMISATION_METADATA')
  })

  it('exactly eight kinds', () => {
    expect(ADAPTATION_KINDS.length).toBe(8)
  })
})

// ── Repository ports ───────────────────────────────────────────────────────────

describe('repository port shapes', () => {
  it('AdaptationRepository has save/find/list', () => {
    const noop = async () => {}
    const undef = async () => undefined
    const empty = async () => []
    const repo: AdaptationRepository = { save: noop, find: undef, list: empty }
    expect(typeof repo.save).toBe('function')
    expect(typeof repo.find).toBe('function')
    expect(typeof repo.list).toBe('function')
  })

  it('ProposalRepository has save/find/list', () => {
    const repo: ProposalRepository = { save: async () => {}, find: async () => undefined, list: async () => [] }
    expect(typeof repo.save).toBe('function')
  })

  it('EvaluationRepository has save/find/list', () => {
    const repo: EvaluationRepository = { save: async () => {}, find: async () => undefined, list: async () => [] }
    expect(typeof repo.save).toBe('function')
  })

  it('AdmissionRepository has save/find/list', () => {
    const repo: AdmissionRepository = { save: async () => {}, find: async () => undefined, list: async () => [] }
    expect(typeof repo.save).toBe('function')
  })
})

// ── Cross-stage read-only ports ────────────────────────────────────────────────

describe('cross-stage port shapes', () => {
  it('ExecutionEvidencePort has getEvidence', () => {
    const port: ExecutionEvidencePort = { getEvidence: async () => undefined }
    expect(typeof port.getEvidence).toBe('function')
  })

  it('EvaluationEvidencePort has getEvaluationResult', () => {
    const port: EvaluationEvidencePort = { getEvaluationResult: async () => undefined }
    expect(typeof port.getEvaluationResult).toBe('function')
  })

  it('ReliabilityEvidencePort has getReliabilityProfile', () => {
    const port: ReliabilityEvidencePort = { getReliabilityProfile: async () => undefined }
    expect(typeof port.getReliabilityProfile).toBe('function')
  })

  it('RoutingEvidencePort has getRoutingDecision', () => {
    const port: RoutingEvidencePort = { getRoutingDecision: async () => undefined }
    expect(typeof port.getRoutingDecision).toBe('function')
  })

  it('EconomicsEvidencePort has getEconomicsEvidence', () => {
    const port: EconomicsEvidencePort = { getEconomicsEvidence: async () => undefined }
    expect(typeof port.getEconomicsEvidence).toBe('function')
  })

  it('PolicyEvidencePort has getPolicyAdmission', () => {
    const port: PolicyEvidencePort = { getPolicyAdmission: async () => undefined }
    expect(typeof port.getPolicyAdmission).toBe('function')
  })
})

// ── Owner controller command port ─────────────────────────────────────────────

describe('OwnerControllerCommandPort', () => {
  it('has requestActivation and requestRollback', () => {
    const port: OwnerControllerCommandPort = {
      requestActivation: async () => ({ accepted: true }),
      requestRollback: async () => ({ accepted: true }),
    }
    expect(typeof port.requestActivation).toBe('function')
    expect(typeof port.requestRollback).toBe('function')
  })

  it('does NOT have direct write methods', () => {
    const port: OwnerControllerCommandPort = {
      requestActivation: async () => ({ accepted: true }),
      requestRollback: async () => ({ accepted: true }),
    }
    expect('writeRepository' in port).toBe(false)
    expect('mutateProduction' in port).toBe(false)
  })
})

// ── Utility ports ─────────────────────────────────────────────────────────────

describe('GovernedLearningClock', () => {
  it('now() returns IsoTimestamp', () => {
    const clock: GovernedLearningClock = { now: () => NOW }
    expect(clock.now()).toBe(NOW)
  })
})

describe('GovernedLearningIdGenerator', () => {
  it('nextId() returns string', () => {
    const gen: GovernedLearningIdGenerator = { nextId: () => 'id-1' }
    expect(gen.nextId()).toBe('id-1')
  })
})

describe('GovernedLearningHasher', () => {
  it('hash() returns sha256-prefixed string', () => {
    const hasher: GovernedLearningHasher = {
      hash: (v) => `sha256:${'a'.repeat(64)}` as ContentHash,
    }
    expect(hasher.hash({ x: 1 })).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})

// ── Architecture guardrails ────────────────────────────────────────────────────

describe('architecture: no direct mutation or optimiser authority', () => {
  it('no executeAdaptation export', async () => {
    const mod = await import('../../src/index.js')
    expect('executeAdaptation' in mod).toBe(false)
  })

  it('no mutateProduction export', async () => {
    const mod = await import('../../src/index.js')
    expect('mutateProduction' in mod).toBe(false)
  })

  it('no trainModel export', async () => {
    const mod = await import('../../src/index.js')
    expect('trainModel' in mod).toBe(false)
  })

  it('no cloudAutoML export', async () => {
    const mod = await import('../../src/index.js')
    expect('cloudAutoML' in mod).toBe(false)
  })
})

describe('architecture: JSON safety', () => {
  it('GovernedLearningError serializes without circular refs', () => {
    const e = makeGovernedLearningError('GOVERNED_LEARNING_MISSING_EVIDENCE', 'test')
    expect(() => JSON.stringify({ code: e.code, message: e.message })).not.toThrow()
  })
})
