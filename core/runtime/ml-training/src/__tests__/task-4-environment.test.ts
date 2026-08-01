import { describe, it, expect } from 'vitest'
import type { ContentHash } from '@rohinik-org/ml-ir'
import type { TrainingIsoTimestamp, TrainingSeedPolicy } from '../../src/index.js'
import {
  validateTrainingEnvironment,
  canonicalizeHyperparameters,
  validateSeedPolicy,
  assessReproducibility,
  type TrainingEnvironmentInput,
  type TrainingEnvironmentResult,
  type HyperparameterSchema,
  type ReproducibilityAssessment,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const H   = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS  = (s: string) => s as TrainingIsoTimestamp

const VALID_ENV: TrainingEnvironmentInput = {
  imageRef:           'registry.example.com/trainer@sha256:' + 'a'.repeat(64),
  imageHash:          H('image'),
  runtimeVersion:     '3.11.9',
  dependencyHash:     H('deps'),
  hardwareProfile:    'gpu-a100',
  environmentHash:    H('env'),
}

// ── validateTrainingEnvironment ───────────────────────────────────────────────

describe('validateTrainingEnvironment', () => {
  it('accepts valid environment with digest-pinned image', () => {
    expect(() => validateTrainingEnvironment(VALID_ENV)).not.toThrow()
  })

  it('rejects mutable tag (no digest in imageRef)', () => {
    const bad: TrainingEnvironmentInput = { ...VALID_ENV, imageRef: 'registry.example.com/trainer:latest' }
    expect(() => validateTrainingEnvironment(bad)).toThrow(/TRAINING_ENVIRONMENT_MUTABLE_TAG/)
  })

  it('rejects empty imageHash', () => {
    const bad: TrainingEnvironmentInput = { ...VALID_ENV, imageHash: '' as ContentHash }
    expect(() => validateTrainingEnvironment(bad)).toThrow()
  })

  it('rejects empty dependencyHash', () => {
    const bad: TrainingEnvironmentInput = { ...VALID_ENV, dependencyHash: '' as ContentHash }
    expect(() => validateTrainingEnvironment(bad)).toThrow()
  })

  it('rejects empty runtimeVersion', () => {
    const bad: TrainingEnvironmentInput = { ...VALID_ENV, runtimeVersion: '' }
    expect(() => validateTrainingEnvironment(bad)).toThrow()
  })

  it('returns validated environment with environmentHash', () => {
    const result = validateTrainingEnvironment(VALID_ENV)
    expect(result.environmentHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('environmentHash is deterministic for same input', () => {
    const r1 = validateTrainingEnvironment(VALID_ENV)
    const r2 = validateTrainingEnvironment(VALID_ENV)
    expect(r1.environmentHash).toBe(r2.environmentHash)
  })

  it('environmentHash changes when dependencyHash changes', () => {
    const r1 = validateTrainingEnvironment(VALID_ENV)
    const r2 = validateTrainingEnvironment({ ...VALID_ENV, dependencyHash: H('deps2') })
    expect(r1.environmentHash).not.toBe(r2.environmentHash)
  })
})

// ── canonicalizeHyperparameters ───────────────────────────────────────────────

describe('canonicalizeHyperparameters', () => {
  it('accepts valid JSON-safe hyperparameters', () => {
    const result = canonicalizeHyperparameters({ lr: 0.01, epochs: 10, optimizer: 'adam' })
    expect(result.canonical).toBeDefined()
    expect(result.paramHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('ordering invariant: different insertion order → same hash', () => {
    const r1 = canonicalizeHyperparameters({ lr: 0.01, epochs: 10 })
    const r2 = canonicalizeHyperparameters({ epochs: 10, lr: 0.01 })
    expect(r1.paramHash).toBe(r2.paramHash)
  })

  it('rejects non-finite number', () => {
    expect(() => canonicalizeHyperparameters({ lr: Infinity })).toThrow()
  })

  it('rejects NaN', () => {
    expect(() => canonicalizeHyperparameters({ lr: NaN })).toThrow()
  })

  it('rejects undefined value', () => {
    expect(() => canonicalizeHyperparameters({ lr: undefined as unknown as number })).toThrow()
  })

  it('with schema: rejects unknown parameter', () => {
    const schema: HyperparameterSchema = {
      allowedKeys: ['lr', 'epochs'],
      required: ['lr'],
    }
    expect(() => canonicalizeHyperparameters({ lr: 0.01, unknown_key: 1 }, schema)).toThrow()
  })

  it('with schema: rejects missing required parameter', () => {
    const schema: HyperparameterSchema = {
      allowedKeys: ['lr', 'epochs'],
      required: ['lr'],
    }
    expect(() => canonicalizeHyperparameters({ epochs: 10 }, schema)).toThrow()
  })

  it('with schema: accepts all allowed params', () => {
    const schema: HyperparameterSchema = {
      allowedKeys: ['lr', 'epochs'],
      required: ['lr'],
    }
    expect(() => canonicalizeHyperparameters({ lr: 0.01, epochs: 10 }, schema)).not.toThrow()
  })
})

// ── validateSeedPolicy ────────────────────────────────────────────────────────

describe('validateSeedPolicy', () => {
  it('accepts FIXED seed with fixedSeed number', () => {
    const policy: TrainingSeedPolicy = { mode: 'FIXED', fixedSeed: 42 }
    expect(() => validateSeedPolicy(policy)).not.toThrow()
  })

  it('rejects FIXED seed without fixedSeed', () => {
    const policy: TrainingSeedPolicy = { mode: 'FIXED' }
    expect(() => validateSeedPolicy(policy)).toThrow(/TRAINING_SEED_POLICY_INVALID/)
  })

  it('accepts RANDOM seed without fixedSeed', () => {
    const policy: TrainingSeedPolicy = { mode: 'RANDOM' }
    expect(() => validateSeedPolicy(policy)).not.toThrow()
  })

  it('accepts NONDETERMINISTIC with justification', () => {
    const policy: TrainingSeedPolicy = { mode: 'NONDETERMINISTIC', justification: 'online RL requires stochastic exploration' }
    expect(() => validateSeedPolicy(policy)).not.toThrow()
  })

  it('rejects NONDETERMINISTIC without justification', () => {
    const policy: TrainingSeedPolicy = { mode: 'NONDETERMINISTIC' }
    expect(() => validateSeedPolicy(policy)).toThrow(/TRAINING_SEED_POLICY_INVALID/)
  })
})

// ── assessReproducibility ─────────────────────────────────────────────────────

describe('assessReproducibility', () => {
  it('FIXED seed + pinned env → LIKELY_REPRODUCIBLE', () => {
    const result = assessReproducibility(
      { mode: 'FIXED', fixedSeed: 42 },
      validateTrainingEnvironment(VALID_ENV),
    )
    expect(result.level).toBe('LIKELY_REPRODUCIBLE')
  })

  it('RANDOM seed → NOT_GUARANTEED', () => {
    const result = assessReproducibility(
      { mode: 'RANDOM' },
      validateTrainingEnvironment(VALID_ENV),
    )
    expect(result.level).toBe('NOT_GUARANTEED')
  })

  it('NONDETERMINISTIC → NOT_GUARANTEED', () => {
    const result = assessReproducibility(
      { mode: 'NONDETERMINISTIC', justification: 'required for RL' },
      validateTrainingEnvironment(VALID_ENV),
    )
    expect(result.level).toBe('NOT_GUARANTEED')
  })

  it('FIXED seed alone does NOT imply EXACT reproducibility', () => {
    const result = assessReproducibility(
      { mode: 'FIXED', fixedSeed: 42 },
      validateTrainingEnvironment(VALID_ENV),
    )
    expect(result.level).not.toBe('EXACT')
  })

  it('assessment has disclosureHash', () => {
    const result = assessReproducibility(
      { mode: 'FIXED', fixedSeed: 42 },
      validateTrainingEnvironment(VALID_ENV),
    )
    expect(result.disclosureHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('disclosure is deterministic for same inputs', () => {
    const env = validateTrainingEnvironment(VALID_ENV)
    const r1 = assessReproducibility({ mode: 'FIXED', fixedSeed: 42 }, env)
    const r2 = assessReproducibility({ mode: 'FIXED', fixedSeed: 42 }, env)
    expect(r1.disclosureHash).toBe(r2.disclosureHash)
  })
})

// ── TrainingEnvironmentResult shape ──────────────────────────────────────────

describe('TrainingEnvironmentResult', () => {
  it('has imageRef, imageHash, dependencyHash, environmentHash', () => {
    const result: TrainingEnvironmentResult = validateTrainingEnvironment(VALID_ENV)
    expect(result.imageRef).toBe(VALID_ENV.imageRef)
    expect(result.imageHash).toBe(VALID_ENV.imageHash)
    expect(result.dependencyHash).toBe(VALID_ENV.dependencyHash)
    expect(result.environmentHash).toBeDefined()
  })
})
