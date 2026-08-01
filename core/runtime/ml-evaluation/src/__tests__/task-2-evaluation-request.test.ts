import { describe, it, expect } from 'vitest'
import type {
  EvaluationId,
  ContentHash,
  IsoTimestamp,
} from '@rohinik-org/ml-ir'
import type { CandidateModelArtifact } from '@rohinik-org/ml-training'
import {
  buildEvaluationRequest,
  CandidateEvaluationRequestBuilder,
  type CandidateEvaluationRequest,
  type EvaluationSuiteReference,
  type EvaluationDatasetBinding,
  makeEvaluationGovernanceError,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const NOW = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const HASH2 = `sha256:${'b'.repeat(64)}` as ContentHash

function makeCandidate(overrides?: Partial<CandidateModelArtifact>): CandidateModelArtifact {
  return {
    artifactId: 'art-1',
    runId: 'run-1' as import('@rohinik-org/ml-ir').TrainingRunId,
    experimentId: 'exp-1' as import('@rohinik-org/ml-ir').ExperimentId,
    lifecycleState: 'CANDIDATE',
    runHash: HASH,
    canonicalHash: HASH,
    createdAt: NOW,
    ...overrides,
  } as CandidateModelArtifact
}

function makeSuite(overrides?: Partial<EvaluationSuiteReference>): EvaluationSuiteReference {
  return {
    suiteId: 'suite-1',
    suiteVersion: '1.0.0',
    suiteHash: HASH,
    ...overrides,
  }
}

function makeDataset(overrides?: Partial<EvaluationDatasetBinding>): EvaluationDatasetBinding {
  return {
    datasetId: 'ds-1',
    datasetVersion: '1',
    admissionStatus: 'ADMITTED',
    ...overrides,
  }
}

// ── valid request ─────────────────────────────────────────────────────────────

describe('buildEvaluationRequest: valid', () => {
  it('returns immutable CandidateEvaluationRequest with all required fields', () => {
    const req = buildEvaluationRequest({
      evaluationId: 'eval-1' as EvaluationId,
      candidate: makeCandidate(),
      suite: makeSuite(),
      dataset: makeDataset(),
      requestedAt: NOW,
      requestedBy: 'principal-1',
    })
    expect(req.evaluationId).toBe('eval-1')
    expect(req.candidate.artifactId).toBe('art-1')
    expect(req.suite.suiteId).toBe('suite-1')
    expect(req.dataset.datasetId).toBe('ds-1')
    expect(req.requestedBy).toBe('principal-1')
    expect(req.promotionOutcome).toBeUndefined()
  })

  it('canonical request hash is deterministic', () => {
    const input = {
      evaluationId: 'eval-1' as EvaluationId,
      candidate: makeCandidate(),
      suite: makeSuite(),
      dataset: makeDataset(),
      requestedAt: NOW,
      requestedBy: 'principal-1',
    }
    const r1 = buildEvaluationRequest(input)
    const r2 = buildEvaluationRequest(input)
    expect(r1.requestHash).toBe(r2.requestHash)
    expect(r1.requestHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('different candidates produce different hashes', () => {
    const base = { evaluationId: 'eval-1' as EvaluationId, suite: makeSuite(), dataset: makeDataset(), requestedAt: NOW, requestedBy: 'p' }
    const r1 = buildEvaluationRequest({ ...base, candidate: makeCandidate({ artifactId: 'art-1' }) })
    const r2 = buildEvaluationRequest({ ...base, candidate: makeCandidate({ artifactId: 'art-2' }) })
    expect(r1.requestHash).not.toBe(r2.requestHash)
  })

  it('provider extension is carried through', () => {
    const req = buildEvaluationRequest({
      evaluationId: 'eval-1' as EvaluationId,
      candidate: makeCandidate(),
      suite: makeSuite(),
      dataset: makeDataset(),
      requestedAt: NOW,
      requestedBy: 'p',
      providerExtension: { gpu: 'a100' },
    })
    expect(req.providerExtension?.['gpu']).toBe('a100')
  })
})

// ── non-candidate rejection ───────────────────────────────────────────────────

describe('buildEvaluationRequest: non-candidate state', () => {
  it('throws EVALUATION_CANDIDATE_NOT_CANDIDATE_STATE when lifecycleState is not CANDIDATE', () => {
    expect(() =>
      buildEvaluationRequest({
        evaluationId: 'eval-1' as EvaluationId,
        candidate: makeCandidate({ lifecycleState: 'PROMOTED' as 'CANDIDATE' }),
        suite: makeSuite(),
        dataset: makeDataset(),
        requestedAt: NOW,
        requestedBy: 'p',
      })
    ).toThrow('EVALUATION_CANDIDATE_NOT_CANDIDATE_STATE')
  })
})

// ── identity validation ───────────────────────────────────────────────────────

describe('buildEvaluationRequest: identity validation', () => {
  it('throws EVALUATION_INVALID_IDENTITY on empty evaluationId', () => {
    expect(() =>
      buildEvaluationRequest({
        evaluationId: '' as EvaluationId,
        candidate: makeCandidate(),
        suite: makeSuite(),
        dataset: makeDataset(),
        requestedAt: NOW,
        requestedBy: 'p',
      })
    ).toThrow('EVALUATION_INVALID_IDENTITY')
  })

  it('throws EVALUATION_INVALID_IDENTITY on empty requestedBy', () => {
    expect(() =>
      buildEvaluationRequest({
        evaluationId: 'eval-1' as EvaluationId,
        candidate: makeCandidate(),
        suite: makeSuite(),
        dataset: makeDataset(),
        requestedAt: NOW,
        requestedBy: '',
      })
    ).toThrow('EVALUATION_INVALID_IDENTITY')
  })
})

// ── suite validation ──────────────────────────────────────────────────────────

describe('buildEvaluationRequest: suite reference', () => {
  it('throws EVALUATION_SUITE_MISSING on empty suiteId', () => {
    expect(() =>
      buildEvaluationRequest({
        evaluationId: 'eval-1' as EvaluationId,
        candidate: makeCandidate(),
        suite: makeSuite({ suiteId: '' }),
        dataset: makeDataset(),
        requestedAt: NOW,
        requestedBy: 'p',
      })
    ).toThrow('EVALUATION_SUITE_MISSING')
  })

  it('throws EVALUATION_SUITE_HASH_MISMATCH on invalid suiteHash format', () => {
    expect(() =>
      buildEvaluationRequest({
        evaluationId: 'eval-1' as EvaluationId,
        candidate: makeCandidate(),
        suite: makeSuite({ suiteHash: 'not-a-hash' as ContentHash }),
        dataset: makeDataset(),
        requestedAt: NOW,
        requestedBy: 'p',
      })
    ).toThrow('EVALUATION_SUITE_HASH_MISMATCH')
  })
})

// ── dataset binding ───────────────────────────────────────────────────────────

describe('buildEvaluationRequest: dataset binding', () => {
  it('throws EVALUATION_DATASET_NOT_ADMITTED when dataset not admitted', () => {
    expect(() =>
      buildEvaluationRequest({
        evaluationId: 'eval-1' as EvaluationId,
        candidate: makeCandidate(),
        suite: makeSuite(),
        dataset: makeDataset({ admissionStatus: 'REJECTED' }),
        requestedAt: NOW,
        requestedBy: 'p',
      })
    ).toThrow('EVALUATION_DATASET_NOT_ADMITTED')
  })

  it('throws EVALUATION_DATASET_NOT_ADMITTED on DELETED dataset', () => {
    expect(() =>
      buildEvaluationRequest({
        evaluationId: 'eval-1' as EvaluationId,
        candidate: makeCandidate(),
        suite: makeSuite(),
        dataset: makeDataset({ admissionStatus: 'DELETED' }),
        requestedAt: NOW,
        requestedBy: 'p',
      })
    ).toThrow('EVALUATION_DATASET_NOT_ADMITTED')
  })
})

// ── idempotent registration / conflict detection ──────────────────────────────

describe('CandidateEvaluationRequestBuilder: idempotency', () => {
  it('same input registered twice is idempotent (same hash)', () => {
    const store = new Map<string, CandidateEvaluationRequest>()
    const builder = CandidateEvaluationRequestBuilder({ store })
    const input = {
      evaluationId: 'eval-1' as EvaluationId,
      candidate: makeCandidate(),
      suite: makeSuite(),
      dataset: makeDataset(),
      requestedAt: NOW,
      requestedBy: 'p',
    }
    const r1 = builder.register(input)
    const r2 = builder.register(input)
    expect(r1.idempotent).toBe(false)
    expect(r2.idempotent).toBe(true)
    expect(r2.conflict).toBe(false)
  })

  it('same evaluationId with different candidate triggers conflict', () => {
    const store = new Map<string, CandidateEvaluationRequest>()
    const builder = CandidateEvaluationRequestBuilder({ store })
    builder.register({
      evaluationId: 'eval-1' as EvaluationId,
      candidate: makeCandidate({ artifactId: 'art-1' }),
      suite: makeSuite(),
      dataset: makeDataset(),
      requestedAt: NOW,
      requestedBy: 'p',
    })
    const r2 = builder.register({
      evaluationId: 'eval-1' as EvaluationId,
      candidate: makeCandidate({ artifactId: 'art-2' }),
      suite: makeSuite(),
      dataset: makeDataset(),
      requestedAt: NOW,
      requestedBy: 'p',
    })
    expect(r2.conflict).toBe(true)
  })
})

// ── no promotion outcome in request ──────────────────────────────────────────

describe('CandidateEvaluationRequest has no promotion outcome', () => {
  it('request does not carry promotionDecision field', () => {
    const req = buildEvaluationRequest({
      evaluationId: 'eval-1' as EvaluationId,
      candidate: makeCandidate(),
      suite: makeSuite(),
      dataset: makeDataset(),
      requestedAt: NOW,
      requestedBy: 'p',
    })
    expect('promotionDecision' in req).toBe(false)
    expect(req.promotionOutcome).toBeUndefined()
  })
})
