import { describe, it, expect } from 'vitest'

// These imports will fail until implementation exists
import {
  modelId, datasetId, partitionId, featureSchemaId, experimentId,
  trainingRunId, checkpointId, evaluationId, promotionDecisionId,
  deploymentId, endpointId, inferenceRequestId, driftSignalId,
  rollbackDirectiveId, retirementRecordId,
  isoTimestamp, contentHash,
  type ModelId, type DatasetId, type PartitionId, type FeatureSchemaId,
  type ExperimentId, type TrainingRunId, type CheckpointId,
  type EvaluationId, type PromotionDecisionId, type DeploymentId,
  type EndpointId, type InferenceRequestId, type DriftSignalId,
  type RollbackDirectiveId, type RetirementRecordId,
  type IsoTimestamp, type ContentHash,
  type SchemaReference, type ArtifactReference, type ArtifactLocation,
  type ProviderReference, type PolicyDecisionReference, type EvidenceReference,
  type ProviderExtension,
} from '../../src/index.js'

describe('branded IDs: valid construction', () => {
  it('modelId accepts non-empty string', () => {
    const id = modelId('m-001')
    expect(id).toBe('m-001')
  })
  it('datasetId accepts non-empty string', () => {
    expect(datasetId('ds-1')).toBe('ds-1')
  })
  it('partitionId accepts non-empty string', () => {
    expect(partitionId('p-1')).toBe('p-1')
  })
  it('featureSchemaId accepts non-empty string', () => {
    expect(featureSchemaId('fs-1')).toBe('fs-1')
  })
  it('experimentId accepts non-empty string', () => {
    expect(experimentId('exp-1')).toBe('exp-1')
  })
  it('trainingRunId accepts non-empty string', () => {
    expect(trainingRunId('tr-1')).toBe('tr-1')
  })
  it('checkpointId accepts non-empty string', () => {
    expect(checkpointId('ck-1')).toBe('ck-1')
  })
  it('evaluationId accepts non-empty string', () => {
    expect(evaluationId('ev-1')).toBe('ev-1')
  })
  it('promotionDecisionId accepts non-empty string', () => {
    expect(promotionDecisionId('pd-1')).toBe('pd-1')
  })
  it('deploymentId accepts non-empty string', () => {
    expect(deploymentId('dep-1')).toBe('dep-1')
  })
  it('endpointId accepts non-empty string', () => {
    expect(endpointId('ep-1')).toBe('ep-1')
  })
  it('inferenceRequestId accepts non-empty string', () => {
    expect(inferenceRequestId('ir-1')).toBe('ir-1')
  })
  it('driftSignalId accepts non-empty string', () => {
    expect(driftSignalId('dr-1')).toBe('dr-1')
  })
  it('rollbackDirectiveId accepts non-empty string', () => {
    expect(rollbackDirectiveId('rb-1')).toBe('rb-1')
  })
  it('retirementRecordId accepts non-empty string', () => {
    expect(retirementRecordId('ret-1')).toBe('ret-1')
  })
})

describe('branded IDs: blank/empty rejection', () => {
  it('modelId throws on empty string', () => {
    expect(() => modelId('')).toThrow()
  })
  it('datasetId throws on empty string', () => {
    expect(() => datasetId('')).toThrow()
  })
  it('trainingRunId throws on whitespace', () => {
    expect(() => trainingRunId('   ')).toThrow()
  })
  it('promotionDecisionId throws on empty', () => {
    expect(() => promotionDecisionId('')).toThrow()
  })
})

describe('IsoTimestamp', () => {
  it('accepts valid UTC ISO-8601 string', () => {
    const ts = isoTimestamp('2024-01-15T10:30:00.000Z')
    expect(ts).toBe('2024-01-15T10:30:00.000Z')
  })
  it('rejects non-ISO string', () => {
    expect(() => isoTimestamp('January 15 2024')).toThrow()
  })
  it('rejects empty string', () => {
    expect(() => isoTimestamp('')).toThrow()
  })
  it('rejects string without Z or offset', () => {
    expect(() => isoTimestamp('2024-01-15T10:30:00')).toThrow()
  })
})

describe('ContentHash', () => {
  it('accepts valid sha256 hex hash', () => {
    const h = contentHash('sha256:' + 'a'.repeat(64))
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/)
  })
  it('rejects hash without sha256: prefix', () => {
    expect(() => contentHash('a'.repeat(64))).toThrow()
  })
  it('rejects uppercase hex', () => {
    expect(() => contentHash('sha256:' + 'A'.repeat(64))).toThrow()
  })
  it('rejects wrong hex length', () => {
    expect(() => contentHash('sha256:' + 'a'.repeat(32))).toThrow()
  })
  it('rejects empty string', () => {
    expect(() => contentHash('')).toThrow()
  })
})

describe('JSON round-trip: branded IDs serialize as strings', () => {
  it('ModelId round-trips via JSON', () => {
    const id = modelId('m-abc')
    const json = JSON.stringify({ id })
    const parsed = JSON.parse(json) as { id: string }
    expect(parsed.id).toBe('m-abc')
  })
  it('IsoTimestamp round-trips via JSON', () => {
    const ts = isoTimestamp('2024-06-01T00:00:00.000Z')
    const parsed = JSON.parse(JSON.stringify({ ts })) as { ts: string }
    expect(parsed.ts).toBe('2024-06-01T00:00:00.000Z')
  })
})

describe('cross-domain compile-time type incompatibility', () => {
  it('ModelId and DatasetId are not assignable (type-level)', () => {
    // Type test: the brands keep them distinct.
    // We can only prove this at compile time, but we can check the runtime values are strings.
    const m = modelId('m-1')
    const d = datasetId('d-1')
    // Both are strings at runtime but distinct branded types at compile time.
    // Assign to typed variables to exercise the type system during typecheck.
    const _m: ModelId = m
    const _d: DatasetId = d
    expect(_m).toBe('m-1')
    expect(_d).toBe('d-1')
  })
})

describe('ProviderExtension: cannot override canonical fields', () => {
  it('ProviderExtension only has providerName and metadata', () => {
    const ext: ProviderExtension = {
      providerName: 'acme',
      metadata: { region: 'us-east-1' },
    }
    // canonical fields like modelId, datasetId are absent from the type
    expect(ext.providerName).toBe('acme')
    expect(ext.metadata).toEqual({ region: 'us-east-1' })
  })
})

describe('reference interfaces', () => {
  it('SchemaReference has schemaId and schemaHash', () => {
    const ref: SchemaReference = { kind: 'schema', schemaId: 's-1', schemaHash: 'sha256:' + 'b'.repeat(64) }
    expect(ref.kind).toBe('schema')
  })
  it('ArtifactReference has artifactId and artifactHash', () => {
    const ref: ArtifactReference = { kind: 'artifact', artifactId: 'a-1', artifactHash: 'sha256:' + 'c'.repeat(64) }
    expect(ref.kind).toBe('artifact')
  })
  it('ArtifactLocation has uri', () => {
    const loc: ArtifactLocation = { uri: 's3://bucket/path' }
    expect(loc.uri.startsWith('s3://')).toBe(true)
  })
  it('ProviderReference has providerId', () => {
    const ref: ProviderReference = { kind: 'provider', providerId: 'p-1' }
    expect(ref.kind).toBe('provider')
  })
  it('PolicyDecisionReference has policyId and decisionHash', () => {
    const ref: PolicyDecisionReference = { kind: 'policy-decision', policyId: 'pol-1', decisionHash: 'sha256:' + 'd'.repeat(64) }
    expect(ref.kind).toBe('policy-decision')
  })
  it('EvidenceReference has evidenceId and evidenceHash', () => {
    const ref: EvidenceReference = { kind: 'evidence', evidenceId: 'ev-1', evidenceHash: 'sha256:' + 'e'.repeat(64) }
    expect(ref.kind).toBe('evidence')
  })
})
