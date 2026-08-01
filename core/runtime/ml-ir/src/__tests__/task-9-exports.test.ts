import { describe, it, expect } from 'vitest'

// ── Root export completeness ───────────────────────────────────────────────────
// Every symbol exported from @rohinik-org/ml-ir must appear here.
// Add new exports to this list when Tasks 3-8 are extended.

import * as MlIr from '../../src/index.js'

describe('export completeness: Task 1-3 primitives and serialization', () => {
  it('exports isJsonPrimitive', () => { expect(MlIr.isJsonPrimitive).toBeDefined() })
  it('exports isJsonValue', () => { expect(MlIr.isJsonValue).toBeDefined() })
  it('exports ML_CANONICALIZATION_VERSION', () => { expect(MlIr.ML_CANONICALIZATION_VERSION).toBe('1') })
  it('exports canonicalMlJson', () => { expect(MlIr.canonicalMlJson).toBeDefined() })
  it('exports canonicalMlHash', () => { expect(MlIr.canonicalMlHash).toBeDefined() })
})

describe('export completeness: Task 2 branded constructors', () => {
  it('exports modelId', () => { expect(MlIr.modelId).toBeDefined() })
  it('exports datasetId', () => { expect(MlIr.datasetId).toBeDefined() })
  it('exports trainingRunId', () => { expect(MlIr.trainingRunId).toBeDefined() })
  it('exports checkpointId', () => { expect(MlIr.checkpointId).toBeDefined() })
  it('exports evaluationId', () => { expect(MlIr.evaluationId).toBeDefined() })
  it('exports promotionDecisionId', () => { expect(MlIr.promotionDecisionId).toBeDefined() })
  it('exports deploymentId', () => { expect(MlIr.deploymentId).toBeDefined() })
  it('exports endpointId', () => { expect(MlIr.endpointId).toBeDefined() })
  it('exports inferenceRequestId', () => { expect(MlIr.inferenceRequestId).toBeDefined() })
  it('exports driftSignalId', () => { expect(MlIr.driftSignalId).toBeDefined() })
  it('exports rollbackDirectiveId', () => { expect(MlIr.rollbackDirectiveId).toBeDefined() })
  it('exports retirementRecordId', () => { expect(MlIr.retirementRecordId).toBeDefined() })
  it('exports isoTimestamp', () => { expect(MlIr.isoTimestamp).toBeDefined() })
  it('exports contentHash', () => { expect(MlIr.contentHash).toBeDefined() })
})

describe('export completeness: Task 4-8 validators', () => {
  it('exports isValidModelLifecycleState', () => { expect(MlIr.isValidModelLifecycleState).toBeDefined() })
  it('exports isValidDatasetLifecycleState', () => { expect(MlIr.isValidDatasetLifecycleState).toBeDefined() })
  it('exports isValidTrainingRunTransition', () => { expect(MlIr.isValidTrainingRunTransition).toBeDefined() })
  it('exports TRAINING_RUN_TERMINAL_STATES', () => { expect(MlIr.TRAINING_RUN_TERMINAL_STATES).toBeDefined() })
  it('exports isValidDeploymentTransition', () => { expect(MlIr.isValidDeploymentTransition).toBeDefined() })
  it('exports isValidEndpointTransition', () => { expect(MlIr.isValidEndpointTransition).toBeDefined() })
  it('exports isValidTrafficAllocation', () => { expect(MlIr.isValidTrafficAllocation).toBeDefined() })
  it('exports isValidConfidence', () => { expect(MlIr.isValidConfidence).toBeDefined() })
  it('exports isValidObservationWindow', () => { expect(MlIr.isValidObservationWindow).toBeDefined() })
})

describe('export completeness: Task 9 service interfaces and events', () => {
  it('exports ML_ERROR_CODES (non-empty set)', () => {
    expect(MlIr.ML_ERROR_CODES).toBeDefined()
    expect(Array.isArray(MlIr.ML_ERROR_CODES)).toBe(true)
    expect((MlIr.ML_ERROR_CODES as readonly string[]).length).toBeGreaterThan(0)
  })
  it('exports makeMlError', () => { expect(MlIr.makeMlError).toBeDefined() })
})

// ── MlError ───────────────────────────────────────────────────────────────────

import { makeMlError, ML_ERROR_CODES, type MlError, type MlErrorCode } from '../../src/index.js'

describe('MlError', () => {
  it('makeMlError produces JSON-safe object', () => {
    const e: MlError = makeMlError('DATASET_NOT_FOUND', 'ds-001 missing')
    expect(e.code).toBe('DATASET_NOT_FOUND')
    expect(e.message).toBe('ds-001 missing')
    expect(JSON.parse(JSON.stringify(e))).toEqual(e)
  })

  it('no stack trace in MlError (JSON-safe)', () => {
    const e = makeMlError('TRAINING_RUN_INVALID_TRANSITION', 'bad state')
    expect(Object.keys(e)).not.toContain('stack')
  })

  it('all error codes are unique strings', () => {
    const codes = ML_ERROR_CODES as readonly string[]
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  it('makeMlError accepts optional details', () => {
    const e = makeMlError('PROMOTION_EVALUATION_MISSING', 'no eval', { modelId: 'm-1' })
    expect(e.details).toEqual({ modelId: 'm-1' })
  })
})

// ── MlEvent envelope ──────────────────────────────────────────────────────────

import {
  type MlEvent, type DatasetEvent, type TrainingEvent,
  type EvaluationEvent, type PromotionEvent, type DeploymentEvent,
  type InferenceEvent, type DriftEvent, type RetirementEvent,
} from '../../src/index.js'

import { modelId, datasetId, deploymentId, driftSignalId, retirementRecordId,
         trainingRunId, evaluationId, promotionDecisionId, endpointId, inferenceRequestId,
         contentHash, isoTimestamp } from '../../src/index.js'

describe('MlEvent envelope', () => {
  it('wraps a DatasetEvent with eventId, occurredAt, and payload', () => {
    const payload: DatasetEvent = {
      kind: 'dataset.version.created',
      datasetId: datasetId('ds-001'),
      version: '1.0.0',
      contentHash: contentHash('sha256:' + 'a'.repeat(64)),
    }
    const env: MlEvent<DatasetEvent> = {
      eventId: 'evt-001',
      occurredAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
      payload,
    }
    expect(env.payload.kind).toBe('dataset.version.created')
  })

  it('event round-trips via JSON', () => {
    const payload: TrainingEvent = {
      kind: 'training.run.state.changed',
      trainingRunId: trainingRunId('tr-001'),
      fromState: 'QUEUED',
      toState: 'RUNNING',
    }
    const env: MlEvent<TrainingEvent> = {
      eventId: 'evt-002',
      occurredAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
      payload,
    }
    const parsed = JSON.parse(JSON.stringify(env)) as MlEvent<TrainingEvent>
    expect(parsed.payload.kind).toBe('training.run.state.changed')
    expect(parsed.eventId).toBe('evt-002')
  })

  it('InferenceEvent does not contain raw payload (sensitive-payload sentinel)', () => {
    const ev: InferenceEvent = {
      kind: 'inference.result.recorded',
      inferenceRequestId: inferenceRequestId('ir-001'),
      endpointId: endpointId('ep-001'),
      outcome: 'SUCCESS',
      evidenceHash: contentHash('sha256:' + 'b'.repeat(64)),
    }
    // No rawInput, no rawOutput — only hashes and IDs
    expect(Object.keys(ev)).not.toContain('rawInput')
    expect(Object.keys(ev)).not.toContain('rawOutput')
    expect(ev.evidenceHash).toBeDefined()
  })

  it('DriftEvent carries driftSignalId and driftType — no raw observation data', () => {
    const ev: DriftEvent = {
      kind: 'drift.signal.detected',
      driftSignalId: driftSignalId('dr-001'),
      deploymentId: deploymentId('dep-001'),
      driftType: 'PERFORMANCE',
      severity: 'HIGH',
    }
    expect(Object.keys(ev)).not.toContain('rawObservations')
    expect(ev.driftSignalId).toBeDefined()
  })

  it('RetirementEvent carries retirementRecordId', () => {
    const ev: RetirementEvent = {
      kind: 'model.retired',
      retirementRecordId: retirementRecordId('ret-001'),
      modelId: modelId('m-001'),
      deploymentId: deploymentId('dep-001'),
    }
    expect(ev.kind).toBe('model.retired')
  })

  it('EvaluationEvent round-trips', () => {
    const ev: EvaluationEvent = {
      kind: 'evaluation.completed',
      evaluationId: evaluationId('ev-001'),
      modelId: modelId('m-001'),
      state: 'COMPLETED',
    }
    const parsed = JSON.parse(JSON.stringify(ev)) as EvaluationEvent
    expect(parsed.kind).toBe('evaluation.completed')
  })

  it('PromotionEvent round-trips', () => {
    const ev: PromotionEvent = {
      kind: 'model.promoted',
      promotionDecisionId: promotionDecisionId('pd-001'),
      modelId: modelId('m-001'),
      environment: 'production',
    }
    const parsed = JSON.parse(JSON.stringify(ev)) as PromotionEvent
    expect(parsed.kind).toBe('model.promoted')
  })

  it('DeploymentEvent round-trips', () => {
    const ev: DeploymentEvent = {
      kind: 'deployment.state.changed',
      deploymentId: deploymentId('dep-001'),
      fromState: 'ROLLING_OUT',
      toState: 'ACTIVE',
    }
    const parsed = JSON.parse(JSON.stringify(ev)) as DeploymentEvent
    expect(parsed.kind).toBe('deployment.state.changed')
  })
})

// ── No accidental runtime dependency ─────────────────────────────────────────

describe('dependency direction: no implementation package imported', () => {
  it('package.json has no runtime dependencies', async () => {
    const pkg = await import('../../package.json', { assert: { type: 'json' } })
    const deps = Object.keys((pkg as { default: { dependencies?: Record<string, string> } }).default.dependencies ?? {})
    expect(deps).toHaveLength(0)
  })
})
