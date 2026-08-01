import { describe, it, expect } from 'vitest'
import type { TrainingRunId, ContentHash, ExperimentId, DatasetId, PartitionId, FeatureSchemaId } from '@rohinik-org/ml-ir'
import type { TrainingIsoTimestamp, GovernedTrainingRun, TrainingRunLifecycleState } from '../../src/index.js'
import {
  buildCandidateArtifact,
  type CandidateModelArtifact,
  type CandidateArtifactBuildInput,
  type CandidateArtifactLifecycleState,
  makeTrainingGovernanceError,
} from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const RUN  = (s: string) => s as TrainingRunId
const EXP  = (s: string) => s as ExperimentId
const DS   = (s: string) => s as DatasetId
const SCH  = (s: string) => s as FeatureSchemaId
const HASH = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS   = (s: string) => s as TrainingIsoTimestamp

const NOW    = TS('2024-06-01T12:00:00.000Z')
const RUN1   = RUN('run-001')
const EXP1   = EXP('exp-001')
const ART_HASH = HASH('artifact-content')

function makeRun(state: TrainingRunLifecycleState = 'SUCCEEDED'): GovernedTrainingRun {
  return {
    runId: RUN1,
    experimentId: EXP1,
    submissionId: 'sub-001',
    submissionHash: HASH('sub'),
    state,
    createdAt: NOW,
    updatedAt: NOW,
    runHash: HASH('run'),
    history: [],
  }
}

function baseInput(): CandidateArtifactBuildInput {
  return {
    artifactId: 'art-001',
    runId: RUN1,
    experimentId: EXP1,
    submissionId: 'sub-001',
    providerOutputUri: 's3://bucket/model.tar.gz',
    providerOutputHash: ART_HASH,
    featureSchemaId: SCH('schema-1'),
    featureSchemaVersion: 'v1',
    datasetBindings: [{ datasetId: DS('ds-1'), version: 'v1' }],
    environmentHash: HASH('env'),
    builtAt: NOW,
  }
}

// ── valid candidate ───────────────────────────────────────────────────────────

describe('buildCandidateArtifact: valid', () => {
  it('builds artifact from SUCCEEDED run', () => {
    const run = makeRun('SUCCEEDED')
    const artifact = buildCandidateArtifact(baseInput(), run)
    expect(artifact.artifactId).toBe('art-001')
    expect(artifact.runId).toBe(RUN1)
    expect(artifact.lifecycleState).toBe('CANDIDATE')
  })

  it('artifact has canonicalHash matching sha256 pattern', () => {
    const artifact = buildCandidateArtifact(baseInput(), makeRun())
    expect(artifact.canonicalHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('artifact carries providerOutputHash and uri', () => {
    const artifact = buildCandidateArtifact(baseInput(), makeRun())
    expect(artifact.providerOutputUri).toBe('s3://bucket/model.tar.gz')
    expect(artifact.providerOutputHash).toBe(ART_HASH)
  })

  it('artifact carries featureSchemaId and version', () => {
    const artifact = buildCandidateArtifact(baseInput(), makeRun())
    expect(artifact.featureSchemaId).toBe(SCH('schema-1'))
    expect(artifact.featureSchemaVersion).toBe('v1')
  })

  it('artifact carries datasetBindings and environmentHash', () => {
    const artifact = buildCandidateArtifact(baseInput(), makeRun())
    expect(artifact.datasetBindings).toHaveLength(1)
    expect(artifact.environmentHash).toBe(HASH('env'))
  })
})

// ── wrong run state ───────────────────────────────────────────────────────────

describe('buildCandidateArtifact: wrong run state', () => {
  const nonSucceeded: TrainingRunLifecycleState[] = ['DRAFT', 'SUBMITTED', 'RUNNING', 'CHECKPOINTING', 'FAILED', 'CANCELLED']

  for (const state of nonSucceeded) {
    it(`rejects run in ${state} state`, () => {
      const run = makeRun(state)
      expect(() => buildCandidateArtifact(baseInput(), run)).toThrow(/TRAINING_PROVIDER_VIOLATION/)
    })
  }
})

// ── hash/identity mismatch ────────────────────────────────────────────────────

describe('buildCandidateArtifact: identity mismatch', () => {
  it('rejects when input.runId does not match run.runId', () => {
    const run = makeRun()
    const input = { ...baseInput(), runId: RUN('run-999') }
    expect(() => buildCandidateArtifact(input, run)).toThrow(/TRAINING_INVALID_IDENTITY/)
  })

  it('rejects when input.experimentId does not match run.experimentId', () => {
    const run = makeRun()
    const input = { ...baseInput(), experimentId: EXP('exp-999') }
    expect(() => buildCandidateArtifact(input, run)).toThrow(/TRAINING_INVALID_IDENTITY/)
  })

  it('rejects when submissionId does not match', () => {
    const run = makeRun()
    const input = { ...baseInput(), submissionId: 'sub-wrong' }
    expect(() => buildCandidateArtifact(input, run)).toThrow(/TRAINING_INVALID_IDENTITY/)
  })
})

// ── missing required fields ───────────────────────────────────────────────────

describe('buildCandidateArtifact: missing provenance', () => {
  it('rejects empty artifactId', () => {
    expect(() => buildCandidateArtifact({ ...baseInput(), artifactId: '' }, makeRun())).toThrow()
  })

  it('rejects empty providerOutputUri', () => {
    expect(() => buildCandidateArtifact({ ...baseInput(), providerOutputUri: '' }, makeRun())).toThrow()
  })

  it('rejects empty featureSchemaId', () => {
    expect(() => buildCandidateArtifact({ ...baseInput(), featureSchemaId: '' as FeatureSchemaId }, makeRun())).toThrow()
  })

  it('rejects empty datasetBindings', () => {
    expect(() => buildCandidateArtifact({ ...baseInput(), datasetBindings: [] }, makeRun())).toThrow()
  })
})

// ── candidate-only lifecycle ──────────────────────────────────────────────────

describe('CandidateModelArtifact: lifecycle is CANDIDATE only', () => {
  it('lifecycleState is CANDIDATE', () => {
    const artifact = buildCandidateArtifact(baseInput(), makeRun())
    expect(artifact.lifecycleState).toBe('CANDIDATE')
  })

  it('artifact has no promotion decision field', () => {
    const artifact = buildCandidateArtifact(baseInput(), makeRun()) as unknown as Record<string, unknown>
    expect(artifact['promotionDecision']).toBeUndefined()
    expect(artifact['deploymentId']).toBeUndefined()
    expect(artifact['endpointId']).toBeUndefined()
  })
})

// ── deterministic canonical hash ──────────────────────────────────────────────

describe('buildCandidateArtifact: deterministic hash', () => {
  it('same inputs produce same canonicalHash', () => {
    const h1 = buildCandidateArtifact(baseInput(), makeRun()).canonicalHash
    const h2 = buildCandidateArtifact(baseInput(), makeRun()).canonicalHash
    expect(h1).toBe(h2)
  })

  it('different providerOutputHash produces different canonicalHash', () => {
    const h1 = buildCandidateArtifact(baseInput(), makeRun()).canonicalHash
    const h2 = buildCandidateArtifact({ ...baseInput(), providerOutputHash: HASH('other') }, makeRun()).canonicalHash
    expect(h1).not.toBe(h2)
  })

  it('different runHash produces different canonicalHash', () => {
    const run1 = makeRun()
    const run2 = { ...makeRun(), runHash: HASH('different-run') }
    const h1 = buildCandidateArtifact(baseInput(), run1).canonicalHash
    const h2 = buildCandidateArtifact(baseInput(), run2).canonicalHash
    expect(h1).not.toBe(h2)
  })
})

// ── idempotency / conflict ────────────────────────────────────────────────────

describe('buildCandidateArtifact: immutability', () => {
  it('returned artifact has no mutable methods', () => {
    const artifact = buildCandidateArtifact(baseInput(), makeRun()) as unknown as Record<string, unknown>
    expect(typeof artifact['update']).not.toBe('function')
    expect(typeof artifact['promote']).not.toBe('function')
    expect(typeof artifact['deploy']).not.toBe('function')
  })

  it('same input builds artifact with same artifactId', () => {
    const a1 = buildCandidateArtifact(baseInput(), makeRun())
    const a2 = buildCandidateArtifact(baseInput(), makeRun())
    expect(a1.artifactId).toBe(a2.artifactId)
    expect(a1.canonicalHash).toBe(a2.canonicalHash)
  })
})
