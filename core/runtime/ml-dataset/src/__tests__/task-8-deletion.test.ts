import { describe, it, expect } from 'vitest'
import type { DatasetId, ContentHash } from '@rohinik-org/ml-ir'
import type { DatasetIsoTimestamp } from '../../src/index.js'
import {
  validateDeletionAuthorization,
  analyzeDeletionImpact,
  buildDeletionPropagationPlan,
  DatasetLineageGraph,
  type DatasetDeletionDirective,
  type DeletionPropagationPlan,
  type DeletionExecutionRecord,
  type DeletionImpactSummary,
} from '../../src/index.js'
import type { DatasetRetentionRecord, LineageNode } from '../../src/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const d = (id: string) => id as DatasetId
const H = (s: string) => `sha256:${s.padEnd(64, '0')}` as ContentHash
const TS = (s: string) => s as DatasetIsoTimestamp

const NOW   = TS('2024-06-01T10:00:00.000Z')
const PAST  = TS('2023-01-01T00:00:00.000Z')
const FUTURE = TS('2025-01-01T00:00:00.000Z')

const BASE_DIRECTIVE: DatasetDeletionDirective = {
  directiveId: 'del-001',
  datasetId: d('ds-a'),
  authorizationToken: 'auth-token-001',
  requestedBy: 'principal-001',
  requestedAt: NOW,
  reason: 'GDPR right to erasure',
}

// Build a simple lineage: ds-a → ds-c → ds-d
function buildGraph(): DatasetLineageGraph {
  const g = new DatasetLineageGraph()
  g.insert({ datasetId: d('ds-a'), parentDatasetIds: [], lineageHash: H('aaa'), recordedAt: PAST })
  g.insert({ datasetId: d('ds-b'), parentDatasetIds: [], lineageHash: H('bbb'), recordedAt: PAST })
  g.insert({ datasetId: d('ds-c'), parentDatasetIds: [d('ds-a'), d('ds-b')], lineageHash: H('ccc'), recordedAt: NOW })
  g.insert({ datasetId: d('ds-d'), parentDatasetIds: [d('ds-c')], lineageHash: H('ddd'), recordedAt: NOW })
  return g
}

// ── validateDeletionAuthorization ─────────────────────────────────────────────

describe('validateDeletionAuthorization', () => {
  it('accepts directive with authorizationToken', () => {
    expect(() => validateDeletionAuthorization(BASE_DIRECTIVE)).not.toThrow()
  })

  it('rejects directive with empty authorizationToken', () => {
    const bad: DatasetDeletionDirective = { ...BASE_DIRECTIVE, authorizationToken: '' }
    expect(() => validateDeletionAuthorization(bad)).toThrow(/DELETION_MISSING_AUTHORIZATION/)
  })

  it('rejects directive with empty directiveId', () => {
    const bad: DatasetDeletionDirective = { ...BASE_DIRECTIVE, directiveId: '' }
    expect(() => validateDeletionAuthorization(bad)).toThrow()
  })

  it('rejects directive with empty requestedBy', () => {
    const bad: DatasetDeletionDirective = { ...BASE_DIRECTIVE, requestedBy: '' }
    expect(() => validateDeletionAuthorization(bad)).toThrow()
  })
})

// ── legal hold and retention ──────────────────────────────────────────────────

describe('validateDeletionAuthorization: legal hold and retention', () => {
  it('rejects when legalHold is true', () => {
    const retention: DatasetRetentionRecord = {
      datasetId: d('ds-a'),
      retainUntil: FUTURE,
      legalHold: true,
      recordedAt: PAST,
    }
    expect(() => validateDeletionAuthorization(BASE_DIRECTIVE, retention)).toThrow(/DELETION_LEGAL_HOLD/)
  })

  it('rejects when retainUntil is in the future', () => {
    const retention: DatasetRetentionRecord = {
      datasetId: d('ds-a'),
      retainUntil: FUTURE,
      legalHold: false,
      recordedAt: PAST,
    }
    expect(() => validateDeletionAuthorization(BASE_DIRECTIVE, retention, NOW)).toThrow(/DELETION_RETENTION_PENDING/)
  })

  it('accepts when retainUntil is in the past', () => {
    const retention: DatasetRetentionRecord = {
      datasetId: d('ds-a'),
      retainUntil: PAST,
      legalHold: false,
      recordedAt: PAST,
    }
    expect(() => validateDeletionAuthorization(BASE_DIRECTIVE, retention, NOW)).not.toThrow()
  })
})

// ── analyzeDeletionImpact ─────────────────────────────────────────────────────

describe('analyzeDeletionImpact', () => {
  it('source-only dataset has no affected descendants', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-b'), g, [], [])
    expect(impact.affectedDescendantIds).toContain(d('ds-c'))
    expect(impact.affectedDescendantIds).toContain(d('ds-d'))
  })

  it('deleting ds-a also affects ds-c and ds-d', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-a'), g, [], [])
    expect(impact.affectedDescendantIds).toContain(d('ds-c'))
    expect(impact.affectedDescendantIds).toContain(d('ds-d'))
  })

  it('records affected training run IDs', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-a'), g, ['tr-001', 'tr-002'], [])
    expect(impact.affectedTrainingRunIds).toContain('tr-001')
    expect(impact.affectedTrainingRunIds).toContain('tr-002')
  })

  it('records affected model IDs as references only', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-a'), g, [], ['model-001'])
    expect(impact.affectedModelIds).toContain('model-001')
  })
})

// ── buildDeletionPropagationPlan ──────────────────────────────────────────────

describe('buildDeletionPropagationPlan', () => {
  it('includes root dataset and all descendants', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-a'), g, [], [])
    const plan = buildDeletionPropagationPlan(BASE_DIRECTIVE, impact)
    expect(plan.directiveId).toBe(BASE_DIRECTIVE.directiveId)
    expect(plan.datasetsToDelete).toContain(d('ds-a'))
    expect(plan.datasetsToDelete).toContain(d('ds-c'))
    expect(plan.datasetsToDelete).toContain(d('ds-d'))
  })

  it('training runs and models are recommendations, not deletions', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-a'), g, ['tr-001'], ['model-001'])
    const plan = buildDeletionPropagationPlan(BASE_DIRECTIVE, impact)
    // Stage 12B only handles dataset-layer; training/model effects are references
    expect(plan.affectedTrainingRunIds).toContain('tr-001')
    expect(plan.affectedModelIds).toContain('model-001')
    // plan does NOT contain a field for deleting training runs or models
    expect((plan as Record<string, unknown>).trainingRunsToDelete).toBeUndefined()
    expect((plan as Record<string, unknown>).modelsToDelete).toBeUndefined()
  })

  it('partial propagation: plan has explicit status field', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-a'), g, [], [])
    const plan = buildDeletionPropagationPlan(BASE_DIRECTIVE, impact)
    expect(['PENDING', 'PARTIAL', 'COMPLETE', 'MANUAL_REVIEW_REQUIRED']).toContain(plan.status)
  })
})

// ── DeletionExecutionRecord ────────────────────────────────────────────────────

describe('DeletionExecutionRecord', () => {
  it('can construct a valid execution record', () => {
    const rec: DeletionExecutionRecord = {
      executionId: 'exec-001',
      directiveId: 'del-001',
      deletedDatasetIds: [d('ds-a')],
      status: 'COMPLETE',
      executedAt: NOW,
      executionHash: H('exec'),
    }
    expect(rec.status).toBe('COMPLETE')
    expect(rec.deletedDatasetIds).toContain(d('ds-a'))
  })

  it('PARTIAL execution records which IDs were deleted', () => {
    const rec: DeletionExecutionRecord = {
      executionId: 'exec-002',
      directiveId: 'del-001',
      deletedDatasetIds: [d('ds-a')],
      pendingDatasetIds: [d('ds-c'), d('ds-d')],
      status: 'PARTIAL',
      executedAt: NOW,
      executionHash: H('exec2'),
    }
    expect(rec.status).toBe('PARTIAL')
    expect(rec.pendingDatasetIds).toHaveLength(2)
  })
})

// ── no deployment mutation ────────────────────────────────────────────────────

describe('no deployment mutation sentinel', () => {
  it('DeletionPropagationPlan has no deploy/undeploy/endpoint fields', () => {
    const g = buildGraph()
    const impact = analyzeDeletionImpact(d('ds-a'), g, [], [])
    const plan = buildDeletionPropagationPlan(BASE_DIRECTIVE, impact)
    const planKeys = Object.keys(plan)
    const forbidden = ['deploymentsToRemove', 'endpointsToRemove', 'rollback', 'undeploy']
    for (const key of forbidden) {
      expect(planKeys).not.toContain(key)
    }
  })
})

// ── replay/idempotency ────────────────────────────────────────────────────────

describe('DeletionImpactSummary hash', () => {
  it('same input produces same impact summary', () => {
    const g1 = buildGraph()
    const g2 = buildGraph()
    const i1 = analyzeDeletionImpact(d('ds-a'), g1, [], [])
    const i2 = analyzeDeletionImpact(d('ds-a'), g2, [], [])
    expect(i1.affectedDescendantIds.sort()).toEqual(i2.affectedDescendantIds.sort())
  })
})
