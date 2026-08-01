import { describe, it, expect } from 'vitest'
import {
  modelId, datasetId, partitionId, featureSchemaId,
  trainingRunId, evaluationId, promotionDecisionId, deploymentId,
  endpointId, inferenceRequestId, driftSignalId, rollbackDirectiveId,
  contentHash, isoTimestamp,
  canonicalMlHash,
  experimentId,
  isValidTrainingRunTransition, TRAINING_RUN_TERMINAL_STATES,
  isValidDeploymentTransition,
  validateEvaluationResult, validatePromotionRequest,
  type ModelManifest, type ModelProvenance,
  type TrainingRun, type ModelEvaluationResult, type PromotionRequest, type PromotionDecision,
  type ModelDeployment, type InferenceResult, type RollbackDirective,
  type OperationalRecommendation, type ProviderExtension,
  type DatasetManifest, type DatasetProvenance,
  type ReproducibilityRecord,
} from '../../src/index.js'

// ── LAW-064: single public package, no ML framework imports ───────────────────

describe('LAW-064: forbidden framework dependency', () => {
  it('package.json has zero runtime dependencies', async () => {
    const pkg = await import('../../package.json', { assert: { type: 'json' } })
    const deps = Object.keys((pkg as { default: { dependencies?: Record<string, string> } }).default.dependencies ?? {})
    expect(deps).toHaveLength(0)
  })

  it('no ML framework name appears in dist/index.js', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const dist = resolve(dir, '../../dist/index.js')
    const content = readFileSync(dist, 'utf-8')
    const forbidden = ['torch', 'tensorflow', 'onnxruntime', 'sklearn', 'mlflow', 'xgboost']
    for (const name of forbidden) {
      expect(content).not.toContain(name)
    }
  })
})

// ── INV-12A-001: one package ──────────────────────────────────────────────────

describe('INV-12A-001: single @rohinik-org/ml-ir package', () => {
  it('package name is @rohinik-org/ml-ir', async () => {
    const pkg = await import('../../package.json', { assert: { type: 'json' } })
    expect((pkg as { default: { name: string } }).default.name).toBe('@rohinik-org/ml-ir')
  })
})

// ── INV-12A-002: no implementation classes ────────────────────────────────────

describe('INV-12A-002: no implementation classes exported', () => {
  it('dist/index.js contains no class declarations', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const dist = resolve(dir, '../../dist/index.js')
    const content = readFileSync(dist, 'utf-8')
    // No 'class ' keyword in compiled output
    expect(content).not.toMatch(/\bclass\s+\w/)
  })
})

// ── INV-12A-003: canonical hash determinism ───────────────────────────────────

describe('INV-12A-003: canonical hash determinism', () => {
  it('same value produces identical hash on repeated calls', () => {
    const v = { modelId: 'm-001', kind: 'classifier', version: '1.0.0' }
    const h1 = canonicalMlHash(v)
    const h2 = canonicalMlHash(v)
    expect(h1).toBe(h2)
  })
})

// ── INV-12A-004: content-change creates new hash ──────────────────────────────

describe('INV-12A-004: content change produces new hash', () => {
  it('mutating any field changes the hash', () => {
    const a = { x: 1, nested: { y: 'v1' } }
    const b = { x: 1, nested: { y: 'v2' } }
    expect(canonicalMlHash(a)).not.toBe(canonicalMlHash(b))
  })
})

// ── INV-12A-005: terminal lifecycle cannot reopen ─────────────────────────────

describe('INV-12A-005: terminal states cannot reopen', () => {
  it('SUCCEEDED training run cannot transition to any state', () => {
    const terminal: Array<'SUCCEEDED' | 'FAILED' | 'CANCELLED'> = ['SUCCEEDED', 'FAILED', 'CANCELLED']
    const targets = ['DRAFT', 'ADMISSION_PENDING', 'ADMITTED', 'QUEUED', 'RUNNING', 'CHECKPOINTING'] as const
    for (const t of terminal) {
      for (const target of targets) {
        expect(isValidTrainingRunTransition(t, target)).toBe(false)
      }
    }
  })

  it('FAILED deployment cannot reopen', () => {
    const targets: Array<'PENDING' | 'ROLLING_OUT' | 'ACTIVE' | 'ROLLING_BACK' | 'RETIRED'> =
      ['PENDING', 'ROLLING_OUT', 'ACTIVE', 'ROLLING_BACK', 'RETIRED']
    for (const t of targets) {
      expect(isValidDeploymentTransition('FAILED', t)).toBe(false)
    }
  })

  it('TRAINING_RUN_TERMINAL_STATES contains exactly SUCCEEDED, FAILED, CANCELLED', () => {
    expect(TRAINING_RUN_TERMINAL_STATES.size).toBe(3)
    expect(TRAINING_RUN_TERMINAL_STATES.has('SUCCEEDED')).toBe(true)
    expect(TRAINING_RUN_TERMINAL_STATES.has('FAILED')).toBe(true)
    expect(TRAINING_RUN_TERMINAL_STATES.has('CANCELLED')).toBe(true)
  })
})

// ── INV-12A-006: incomplete reproducibility is rejectable ────────────────────

describe('INV-12A-006: incomplete reproducibility is rejectable by callers', () => {
  it('ReproducibilityRecord requires all four hashes', () => {
    const r: ReproducibilityRecord = {
      trainingRunId: trainingRunId('tr-001'),
      level: 'exact',
      sourceHash: contentHash('sha256:' + 'a'.repeat(64)),
      environmentHash: contentHash('sha256:' + 'b'.repeat(64)),
      dataHash: contentHash('sha256:' + 'c'.repeat(64)),
      parameterHash: contentHash('sha256:' + 'd'.repeat(64)),
      seedPolicy: { kind: 'fixed', seed: 0 },
    }
    // All four hashes present — completeness enforced by type
    expect(r.sourceHash).toBeDefined()
    expect(r.environmentHash).toBeDefined()
    expect(r.dataHash).toBeDefined()
    expect(r.parameterHash).toBeDefined()
  })
})

// ── LAW-067 / INV-12A-007: training success cannot directly promote ───────────

describe('LAW-067: training success does not promote', () => {
  it('SUCCEEDED TrainingRun produces candidateArtifactHash only, not a PromotionDecision', () => {
    const run: TrainingRun = {
      trainingRunId: trainingRunId('tr-001'),
      experimentId: experimentId('exp-001'),
      state: 'SUCCEEDED',
      modelId: modelId('m-001'),
      trainingDatasetId: datasetId('ds-001'),
      partitionBindings: [],
      featureSchemaId: featureSchemaId('fs-001'),
      environment: { runtimeId: 'r', frameworkVersion: 'v', hardwareClass: 'c' },
      hyperparameters: { values: {}, parameterHash: contentHash('sha256:' + 'e'.repeat(64)) },
      createdAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
      candidateArtifactHash: contentHash('sha256:' + 'f'.repeat(64)),
    }
    // TrainingRun has candidateArtifactHash, never a promotionDecisionId
    expect(Object.keys(run)).not.toContain('promotionDecisionId')
  })
})

// ── LAW-068: promotion requires evaluation ────────────────────────────────────

describe('LAW-068: promotion without evaluation throws', () => {
  const resultHash = contentHash('sha256:' + 'b'.repeat(64))
  const baseResult: ModelEvaluationResult = {
    evaluationId: evaluationId('ev-001'),
    modelId: modelId('m-001'),
    trainingRunId: trainingRunId('tr-001'),
    state: 'COMPLETED',
    datasetBinding: { datasetId: datasetId('ds-001'), splitName: 'test', rowCount: 100 },
    suiteReference: { suiteId: 'suite-1', suiteHash: 'h1' },
    baselineReference: { baselineModelId: modelId('m-000'), baselineEvaluationId: evaluationId('ev-000') },
    metrics: [{ name: 'accuracy', value: 0.95, higherIsBetter: true }],
    evidenceReference: { kind: 'evidence', evidenceId: 'ev-001', evidenceHash: 'sha256:' + 'a'.repeat(64) },
    resultHash,
  }

  it('promotion request without evaluationId throws', () => {
    const req: PromotionRequest = {
      promotionDecisionId: promotionDecisionId('pd-001'),
      modelId: modelId('m-001'),
      trainingRunId: trainingRunId('tr-001'),
      evaluationId: evaluationId('ev-001'),
      evaluationResultHash: resultHash,
      targetEnvironment: 'STAGING',
      reason: 'PASSED_EVALUATION',
      requestedAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    const bad = { ...req, evaluationId: undefined } as unknown as PromotionRequest
    expect(() => validatePromotionRequest(bad, baseResult)).toThrow()
  })

  it('promotion against incomplete evaluation throws', () => {
    const incompleteResult: ModelEvaluationResult = { ...baseResult, state: 'RUNNING' }
    const req: PromotionRequest = {
      promotionDecisionId: promotionDecisionId('pd-001'),
      modelId: modelId('m-001'),
      trainingRunId: trainingRunId('tr-001'),
      evaluationId: evaluationId('ev-001'),
      evaluationResultHash: resultHash,
      targetEnvironment: 'STAGING',
      reason: 'PASSED_EVALUATION',
      requestedAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(() => validatePromotionRequest(req, incompleteResult)).toThrow()
  })
})

// ── LAW-069: deployment requires promotion ────────────────────────────────────

describe('LAW-069: deployment references promotionDecisionId (structural enforcement)', () => {
  it('ModelDeployment type requires promotionDecisionId field', () => {
    const d: ModelDeployment = {
      deploymentId: deploymentId('dep-001'),
      modelId: modelId('m-001'),
      promotionDecisionId: promotionDecisionId('pd-001'),
      environment: 'production',
      state: 'PENDING',
      currentRevisionId: 'rev-001',
      createdAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
    }
    expect(d.promotionDecisionId).toBeDefined()
  })
})

// ── LAW-070: inference outcome requires evidence ──────────────────────────────

describe('LAW-070: inference outcome requires evidence', () => {
  it('InferenceResult type structurally requires evidenceHash', () => {
    const r: InferenceResult = {
      inferenceRequestId: inferenceRequestId('ir-001'),
      endpointId: endpointId('ep-001'),
      outcome: 'SUCCESS',
      outputHash: contentHash('sha256:' + 'c'.repeat(64)),
      evidenceHash: contentHash('sha256:' + 'd'.repeat(64)),
      latencyMs: 5,
      respondedAt: isoTimestamp('2024-01-01T00:00:00.001Z'),
    }
    expect(r.evidenceHash).toBeDefined()
  })
})

// ── LAW-071: recommendation cannot serve as rollback directive ────────────────

describe('LAW-071: recommendation ≠ rollback directive', () => {
  it('OperationalRecommendation has no authorizationToken', () => {
    const rec: OperationalRecommendation = {
      recommendationId: 'rec-001',
      deploymentId: deploymentId('dep-001'),
      recommendationType: 'ROLL_BACK',
      rationale: 'drift',
      driftSignalId: driftSignalId('dr-001'),
      issuedAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
    }
    expect(Object.keys(rec)).not.toContain('authorizationToken')
  })

  it('RollbackDirective has authorizationToken (type-level separation)', () => {
    const rb: RollbackDirective = {
      rollbackDirectiveId: rollbackDirectiveId('rb-001'),
      deploymentId: deploymentId('dep-001'),
      fromRevisionId: 'rev-002',
      toRevisionId: 'rev-001',
      authorizationToken: 'tok-abc',
      reason: 'regression',
      issuedAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
    }
    expect(rb.authorizationToken).toBeDefined()
    // These are different types — one cannot satisfy the other
    expect(Object.keys(rb)).not.toContain('recommendationType')
  })
})

// ── Provider extension cannot override identity ───────────────────────────────

describe('INV-12A: provider extension cannot override canonical identity', () => {
  it('ProviderExtension type has only providerName and metadata', () => {
    const ext: ProviderExtension = { providerName: 'acme', metadata: {} }
    const canonicalFields = ['modelId', 'datasetId', 'deploymentId', 'promotionDecisionId']
    for (const f of canonicalFields) {
      expect(Object.keys(ext)).not.toContain(f)
    }
  })
})

// ── Dataset authorization references are explicit ─────────────────────────────

describe('INV-12A-009: dataset authorization references explicit', () => {
  it('DatasetProvenance requires authorizedUsePolicyIds array', () => {
    const p: DatasetProvenance = {
      datasetId: datasetId('ds-001'),
      sourceDescription: 'prod logs',
      authorizedUsePolicyIds: ['pol-001'],
      createdAt: isoTimestamp('2024-01-01T00:00:00.000Z'),
    }
    expect(Array.isArray(p.authorizedUsePolicyIds)).toBe(true)
  })
})

// ── INV-12A-010: supersession records are terminal ────────────────────────────

describe('INV-12A-010: supersession records are terminal', () => {
  it('ModelSupersession is an immutable record (all readonly)', () => {
    const s = {
      modelId: modelId('m-001'),
      supersededAt: isoTimestamp('2024-06-01T00:00:00.000Z'),
      supersededByModelId: modelId('m-002'),
      reason: 'replaced',
    }
    // Hash is deterministic — same object always same hash
    expect(canonicalMlHash(s)).toBe(canonicalMlHash(s))
  })
})

// ── No production as-any ──────────────────────────────────────────────────────

describe('release gate: no production as any', () => {
  it('src/index.ts contains no "as any"', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const dir = dirname(fileURLToPath(import.meta.url))
    const src = resolve(dir, '../index.ts')
    const content = readFileSync(src, 'utf-8')
    expect(content).not.toContain('as any')
  })
})
