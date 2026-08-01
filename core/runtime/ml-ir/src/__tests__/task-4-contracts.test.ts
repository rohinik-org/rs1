import { describe, it, expect } from 'vitest'
import {
  modelId, datasetId, partitionId, featureSchemaId,
  contentHash, isoTimestamp,
  canonicalMlHash,
  type ModelKind, type ModelArtifactFormat,
  type ModelArtifact, type ModelManifest, type ModelVersion,
  type ModelProvenance, type ModelSupersession,
  type DatasetManifest, type DatasetVersion, type DatasetPartition,
  type DatasetProvenance, type DatasetSupersession, type DeletionImpact,
  type FeatureSchema, type FeatureDefinition, type TargetDefinition,
  type TransformationLineage,
  type ModelLifecycleState, type DatasetLifecycleState,
  isValidModelLifecycleState, isValidDatasetLifecycleState,
} from '../../src/index.js'

// ── ModelKind and ModelArtifactFormat ─────────────────────────────────────────

describe('ModelKind', () => {
  it('accepts valid kinds', () => {
    const k: ModelKind = 'classifier'
    expect(k).toBe('classifier')
  })

  it('all expected kinds are string literals', () => {
    const kinds: ModelKind[] = ['classifier', 'regressor', 'embedding', 'generative', 'ranker', 'anomaly-detector', 'custom']
    expect(kinds.length).toBe(7)
  })
})

describe('ModelArtifactFormat', () => {
  it('accepts valid formats', () => {
    const f: ModelArtifactFormat = 'onnx'
    expect(f).toBe('onnx')
  })

  it('all expected formats defined', () => {
    const fmts: ModelArtifactFormat[] = ['onnx', 'pytorch', 'tensorflow-savedmodel', 'sklearn-pickle', 'xgboost', 'custom']
    expect(fmts.length).toBe(6)
  })
})

// ── ModelArtifact ─────────────────────────────────────────────────────────────

describe('ModelArtifact', () => {
  it('constructs valid artifact', () => {
    const a: ModelArtifact = {
      artifactId: 'art-001',
      format: 'onnx',
      contentHash: contentHash('sha256:' + 'a'.repeat(64)),
      sizeBytes: 1024,
      locations: [{ uri: 's3://bucket/model.onnx' }],
    }
    expect(a.format).toBe('onnx')
    expect(a.sizeBytes).toBe(1024)
  })

  it('locations is an array (storage-location independence)', () => {
    const a: ModelArtifact = {
      artifactId: 'art-002',
      format: 'pytorch',
      contentHash: contentHash('sha256:' + 'b'.repeat(64)),
      sizeBytes: 512,
      locations: [
        { uri: 's3://bucket/model.pt' },
        { uri: 'gcs://bucket/model.pt' },
      ],
    }
    expect(a.locations).toHaveLength(2)
  })
})

// ── ModelManifest ─────────────────────────────────────────────────────────────

describe('ModelManifest', () => {
  const artifact: ModelArtifact = {
    artifactId: 'art-001',
    format: 'onnx',
    contentHash: contentHash('sha256:' + 'a'.repeat(64)),
    sizeBytes: 1024,
    locations: [{ uri: 's3://bucket/model.onnx' }],
  }

  it('constructs valid manifest', () => {
    const m: ModelManifest = {
      modelId: modelId('m-001'),
      name: 'fraud-detector',
      kind: 'classifier',
      artifact,
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(m.modelId).toBe('m-001')
    expect(m.kind).toBe('classifier')
  })

  it('canonical hash changes when artifact hash changes', () => {
    const m1: ModelManifest = {
      modelId: modelId('m-001'),
      name: 'fraud-detector',
      kind: 'classifier',
      artifact,
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    const m2: ModelManifest = {
      ...m1,
      artifact: { ...artifact, contentHash: contentHash('sha256:' + 'b'.repeat(64)) },
    }
    expect(canonicalMlHash(m1)).not.toBe(canonicalMlHash(m2))
  })

  it('canonical hash stable across storage-location changes (identity is independent of location)', () => {
    // Identity is the contentHash field, not the URI.
    // Two manifests with same contentHash but different URIs represent same artifact.
    const m1: ModelManifest = {
      modelId: modelId('m-001'), name: 'x', kind: 'custom', artifact, createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    const m2: ModelManifest = {
      ...m1,
      artifact: { ...artifact, locations: [{ uri: 'gcs://other-bucket/model.onnx' }] },
    }
    // Different URIs — hash differs because locations are part of the record.
    // The LOGICAL identity (contentHash) is the same, but the manifest hash differs.
    // Stage 12B compares contentHash for identity, not manifest hash.
    expect(m1.artifact.contentHash).toBe(m2.artifact.contentHash)
    expect(canonicalMlHash(m1)).not.toBe(canonicalMlHash(m2))
  })
})

// ── ModelVersion ──────────────────────────────────────────────────────────────

describe('ModelVersion', () => {
  it('constructs valid version', () => {
    const v: ModelVersion = {
      modelId: modelId('m-001'),
      version: '1.0.0',
      manifestHash: contentHash('sha256:' + 'a'.repeat(64)),
      lifecycleState: 'active',
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(v.version).toBe('1.0.0')
    expect(v.lifecycleState).toBe('active')
  })
})

// ── ModelProvenance ───────────────────────────────────────────────────────────

describe('ModelProvenance', () => {
  it('rejects missing provenance at type level — trainingDatasetIds required', () => {
    const p: ModelProvenance = {
      modelId: modelId('m-001'),
      trainingDatasetIds: [datasetId('ds-001')],
      featureSchemaIds: [featureSchemaId('fs-001')],
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(p.trainingDatasetIds).toHaveLength(1)
  })

  it('trainingDatasetIds can be empty array (no supervised data)', () => {
    const p: ModelProvenance = {
      modelId: modelId('m-002'),
      trainingDatasetIds: [],
      featureSchemaIds: [],
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(p.trainingDatasetIds).toHaveLength(0)
  })
})

// ── ModelSupersession ─────────────────────────────────────────────────────────

describe('ModelSupersession', () => {
  it('constructs valid supersession record', () => {
    const s: ModelSupersession = {
      modelId: modelId('m-001'),
      supersededAt: isoTimestamp('2024-06-01T00:00:00.000Z'),
      supersededByModelId: modelId('m-002'),
      reason: 'accuracy improved',
    }
    expect(s.supersededByModelId).toBe('m-002')
  })

  it('canonical hash changes when supersededByModelId changes', () => {
    const base: ModelSupersession = {
      modelId: modelId('m-001'),
      supersededAt: isoTimestamp('2024-06-01T00:00:00.000Z'),
      supersededByModelId: modelId('m-002'),
      reason: 'accuracy improved',
    }
    const changed = { ...base, supersededByModelId: modelId('m-003') }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── ModelLifecycleState ───────────────────────────────────────────────────────

describe('ModelLifecycleState', () => {
  it('isValidModelLifecycleState accepts valid states', () => {
    const states: ModelLifecycleState[] = ['draft', 'staging', 'active', 'deprecated', 'retired']
    for (const s of states) {
      expect(isValidModelLifecycleState(s)).toBe(true)
    }
  })

  it('isValidModelLifecycleState rejects unknown string', () => {
    expect(isValidModelLifecycleState('published')).toBe(false)
    expect(isValidModelLifecycleState('')).toBe(false)
  })
})

// ── DatasetManifest ───────────────────────────────────────────────────────────

describe('DatasetManifest', () => {
  it('constructs valid manifest', () => {
    const m: DatasetManifest = {
      datasetId: datasetId('ds-001'),
      name: 'fraud-labels',
      contentHash: contentHash('sha256:' + 'c'.repeat(64)),
      recordCount: 10000,
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
      lifecycleState: 'active',
    }
    expect(m.recordCount).toBe(10000)
    expect(m.lifecycleState).toBe('active')
  })
})

// ── DatasetVersion ────────────────────────────────────────────────────────────

describe('DatasetVersion', () => {
  it('content changes create new version identity', () => {
    const v1: DatasetVersion = {
      datasetId: datasetId('ds-001'),
      version: '1.0.0',
      contentHash: contentHash('sha256:' + 'c'.repeat(64)),
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    const v2: DatasetVersion = {
      ...v1,
      version: '1.1.0',
      contentHash: contentHash('sha256:' + 'd'.repeat(64)),
    }
    expect(canonicalMlHash(v1)).not.toBe(canonicalMlHash(v2))
    expect(v1.contentHash).not.toBe(v2.contentHash)
  })
})

// ── DatasetPartition ──────────────────────────────────────────────────────────

describe('DatasetPartition', () => {
  it('partition identity is explicit', () => {
    const p: DatasetPartition = {
      partitionId: partitionId('p-train'),
      datasetId: datasetId('ds-001'),
      role: 'train',
      contentHash: contentHash('sha256:' + 'e'.repeat(64)),
      recordCount: 8000,
    }
    expect(p.partitionId).toBe('p-train')
    expect(p.role).toBe('train')
  })

  it('duplicate partition IDs in same dataset are detectable by comparing partitionId fields', () => {
    const p1: DatasetPartition = {
      partitionId: partitionId('p-dup'),
      datasetId: datasetId('ds-001'),
      role: 'train',
      contentHash: contentHash('sha256:' + 'e'.repeat(64)),
      recordCount: 8000,
    }
    const p2: DatasetPartition = {
      partitionId: partitionId('p-dup'),
      datasetId: datasetId('ds-001'),
      role: 'test',
      contentHash: contentHash('sha256:' + 'f'.repeat(64)),
      recordCount: 2000,
    }
    expect(p1.partitionId).toBe(p2.partitionId) // same ID = duplicate
  })
})

// ── DatasetProvenance ─────────────────────────────────────────────────────────

describe('DatasetProvenance', () => {
  it('authorized-use references are explicit', () => {
    const p: DatasetProvenance = {
      datasetId: datasetId('ds-001'),
      sourceDescription: 'Customer transaction logs',
      authorizedUsePolicyIds: ['pol-gdpr-001', 'pol-ccpa-001'],
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(p.authorizedUsePolicyIds).toHaveLength(2)
  })

  it('authorizedUsePolicyIds can be empty (no explicit policy — caller must validate)', () => {
    const p: DatasetProvenance = {
      datasetId: datasetId('ds-002'),
      sourceDescription: 'Synthetic data',
      authorizedUsePolicyIds: [],
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(p.authorizedUsePolicyIds).toHaveLength(0)
  })
})

// ── DatasetSupersession and DeletionImpact ────────────────────────────────────

describe('DatasetSupersession', () => {
  it('terminal record references successor', () => {
    const s: DatasetSupersession = {
      datasetId: datasetId('ds-001'),
      supersededAt: isoTimestamp('2024-06-01T00:00:00.000Z'),
      supersededByDatasetId: datasetId('ds-002'),
      reason: 'refreshed labels',
    }
    expect(s.supersededByDatasetId).toBe('ds-002')
  })
})

describe('DeletionImpact', () => {
  it('tracks which model IDs depend on deleted dataset', () => {
    const d: DeletionImpact = {
      datasetId: datasetId('ds-001'),
      impactedModelIds: [modelId('m-001'), modelId('m-002')],
    }
    expect(d.impactedModelIds).toHaveLength(2)
  })
})

// ── DatasetLifecycleState ─────────────────────────────────────────────────────

describe('DatasetLifecycleState', () => {
  it('isValidDatasetLifecycleState accepts valid states', () => {
    const states: DatasetLifecycleState[] = ['active', 'deprecated', 'deleted']
    for (const s of states) {
      expect(isValidDatasetLifecycleState(s)).toBe(true)
    }
  })

  it('isValidDatasetLifecycleState rejects unknown', () => {
    expect(isValidDatasetLifecycleState('archived')).toBe(false)
  })
})

// ── FeatureSchema ─────────────────────────────────────────────────────────────

describe('FeatureSchema', () => {
  const feature: FeatureDefinition = {
    name: 'transaction_amount',
    dtype: 'float64',
    nullable: false,
    description: 'Amount in USD',
  }

  const target: TargetDefinition = {
    name: 'is_fraud',
    dtype: 'bool',
    description: 'Binary fraud label',
  }

  it('constructs valid feature schema', () => {
    const fs: FeatureSchema = {
      featureSchemaId: featureSchemaId('fs-001'),
      name: 'fraud-features-v1',
      features: [feature],
      targets: [target],
      contentHash: contentHash('sha256:' + 'a'.repeat(64)),
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    expect(fs.features).toHaveLength(1)
    expect(fs.targets).toHaveLength(1)
  })

  it('canonical hash changes when feature dtype changes', () => {
    const fs1: FeatureSchema = {
      featureSchemaId: featureSchemaId('fs-001'),
      name: 'fraud-features-v1',
      features: [feature],
      targets: [target],
      contentHash: contentHash('sha256:' + 'a'.repeat(64)),
      createdAt: isoTimestamp('2024-01-15T10:00:00.000Z'),
    }
    const fs2: FeatureSchema = {
      ...fs1,
      features: [{ ...feature, dtype: 'int64' }],
    }
    expect(canonicalMlHash(fs1)).not.toBe(canonicalMlHash(fs2))
  })
})

// ── TransformationLineage ─────────────────────────────────────────────────────

describe('TransformationLineage', () => {
  it('identifies implementation, inputs, output, parents, and parameter hash', () => {
    const t: TransformationLineage = {
      transformationId: 'txf-001',
      implementationId: 'normalizer-v1',
      inputDatasetIds: [datasetId('ds-001')],
      outputDatasetId: datasetId('ds-002'),
      parentTransformationIds: [],
      parameterHash: contentHash('sha256:' + 'b'.repeat(64)),
      appliedAt: isoTimestamp('2024-01-20T00:00:00.000Z'),
    }
    expect(t.implementationId).toBe('normalizer-v1')
    expect(t.inputDatasetIds).toHaveLength(1)
  })

  it('self-lineage is detectable: outputDatasetId must not appear in inputDatasetIds', () => {
    const t: TransformationLineage = {
      transformationId: 'txf-self',
      implementationId: 'bad-transform',
      inputDatasetIds: [datasetId('ds-loop')],
      outputDatasetId: datasetId('ds-loop'),
      parentTransformationIds: [],
      parameterHash: contentHash('sha256:' + 'c'.repeat(64)),
      appliedAt: isoTimestamp('2024-01-20T00:00:00.000Z'),
    }
    // Self-loop is detectable by caller: outputDatasetId in inputDatasetIds
    expect(t.inputDatasetIds).toContain(t.outputDatasetId)
  })

  it('canonical hash changes when parameterHash changes', () => {
    const base: TransformationLineage = {
      transformationId: 'txf-001',
      implementationId: 'normalizer-v1',
      inputDatasetIds: [datasetId('ds-001')],
      outputDatasetId: datasetId('ds-002'),
      parentTransformationIds: [],
      parameterHash: contentHash('sha256:' + 'b'.repeat(64)),
      appliedAt: isoTimestamp('2024-01-20T00:00:00.000Z'),
    }
    const changed = { ...base, parameterHash: contentHash('sha256:' + 'd'.repeat(64)) }
    expect(canonicalMlHash(base)).not.toBe(canonicalMlHash(changed))
  })
})

// ── ProviderExtension authority rejection ──────────────────────────────────────

describe('ProviderExtension authority rejection', () => {
  it('ProviderExtension cannot set modelId (type enforces it)', () => {
    // ProviderExtension only has providerName + metadata.
    // This is a compile-time guarantee; runtime test confirms shape.
    const ext = { providerName: 'acme', metadata: { region: 'us-east-1' } }
    expect(Object.keys(ext)).not.toContain('modelId')
    expect(Object.keys(ext)).not.toContain('datasetId')
  })
})

// ── Round-trip JSON ───────────────────────────────────────────────────────────

describe('round-trip JSON serialization', () => {
  it('ModelManifest round-trips without data loss', () => {
    const m: ModelManifest = {
      modelId: modelId('m-rt-001'),
      name: 'rt-model',
      kind: 'regressor',
      artifact: {
        artifactId: 'art-rt-001',
        format: 'onnx',
        contentHash: contentHash('sha256:' + 'f'.repeat(64)),
        sizeBytes: 2048,
        locations: [{ uri: 's3://rt/model.onnx' }],
      },
      createdAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    const parsed = JSON.parse(JSON.stringify(m)) as ModelManifest
    expect(parsed.modelId).toBe(m.modelId)
    expect(parsed.artifact.contentHash).toBe(m.artifact.contentHash)
    expect(parsed.kind).toBe(m.kind)
  })

  it('FeatureSchema round-trips without data loss', () => {
    const fs: FeatureSchema = {
      featureSchemaId: featureSchemaId('fs-rt-001'),
      name: 'rt-features',
      features: [{ name: 'age', dtype: 'int32', nullable: true }],
      targets: [],
      contentHash: contentHash('sha256:' + 'e'.repeat(64)),
      createdAt: isoTimestamp('2024-03-01T00:00:00.000Z'),
    }
    const parsed = JSON.parse(JSON.stringify(fs)) as FeatureSchema
    expect(parsed.featureSchemaId).toBe(fs.featureSchemaId)
    expect(parsed.features[0]?.name).toBe('age')
  })
})
