import { describe, it, expect } from 'vitest'
import {
  type DatasetId, type PartitionId, type ContentHash, type DatasetIsoTimestamp,
  type GovernedPartition, type PartitionPurpose,
  type LeakageFinding, type LeakageSeverity, type LeakageKind,
  type LeakageReport, type LeakageAssessmentResult,
  type LeakageDetector,
  validatePartitionSet,
  LeakageAssessmentService,
  makeDatasetGovernanceError,
} from '../../src/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makePartition(
  partitionId: string,
  datasetId: string,
  purpose: PartitionPurpose,
): GovernedPartition {
  return {
    partitionId: partitionId as PartitionId,
    datasetId: datasetId as DatasetId,
    role: purpose,
    purpose,
    contentHash: ('sha256:' + 'a'.repeat(64)) as ContentHash,
    recordCount: 100,
  }
}

function makeDetector(
  kind: LeakageKind,
  severity: LeakageSeverity,
  found: boolean,
  available = true,
): LeakageDetector {
  return {
    detectorId: `det-${kind}`,
    leakageKind: kind,
    async assess(_partitions, _datasetId) {
      if (!available) throw new Error('detector unavailable')
      if (!found) return []
      return [{ kind, severity, evidenceRef: `ref-${kind}` }]
    },
  }
}

// ── validatePartitionSet ──────────────────────────────────────────────────────

describe('validatePartitionSet', () => {
  it('accepts valid partition set with TRAIN and TEST', () => {
    const partitions = [
      makePartition('p-1', 'ds-001', 'TRAIN'),
      makePartition('p-2', 'ds-001', 'TEST'),
    ]
    expect(() => validatePartitionSet(partitions)).not.toThrow()
  })

  it('accepts all valid purposes', () => {
    const purposes: PartitionPurpose[] = ['TRAIN', 'VALIDATION', 'TEST', 'CALIBRATION', 'SHADOW', 'CUSTOM']
    const partitions = purposes.map((p, i) => makePartition(`p-${i}`, 'ds-001', p))
    expect(() => validatePartitionSet(partitions)).not.toThrow()
  })

  it('rejects duplicate partition IDs', () => {
    const partitions = [
      makePartition('p-same', 'ds-001', 'TRAIN'),
      makePartition('p-same', 'ds-001', 'TEST'),
    ]
    expect(() => validatePartitionSet(partitions)).toThrow()
  })

  it('rejects empty partition set', () => {
    expect(() => validatePartitionSet([])).toThrow()
  })

  it('rejects partitions from different datasets', () => {
    const partitions = [
      makePartition('p-1', 'ds-001', 'TRAIN'),
      makePartition('p-2', 'ds-002', 'TEST'),
    ]
    expect(() => validatePartitionSet(partitions)).toThrow()
  })
})

// ── LeakageAssessmentService: no leakage ─────────────────────────────────────

describe('LeakageAssessmentService: clean assessment', () => {
  it('returns CLEAN outcome when no detectors fire', async () => {
    const detectors = [
      makeDetector('DIRECT_RECORD', 'HIGH', false),
      makeDetector('SUBJECT', 'MEDIUM', false),
    ]
    const svc = LeakageAssessmentService(detectors)
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(result.outcome).toBe('CLEAN')
    expect(result.findings).toHaveLength(0)
  })
})

// ── LeakageAssessmentService: each leakage class ─────────────────────────────

describe('LeakageAssessmentService: leakage classes', () => {
  const leakageKinds: LeakageKind[] = ['DIRECT_RECORD', 'SUBJECT', 'TEMPORAL', 'FEATURE', 'LABEL', 'TRANSFORMATION']

  for (const kind of leakageKinds) {
    it(`detects ${kind} leakage`, async () => {
      const svc = LeakageAssessmentService([makeDetector(kind, 'HIGH', true)])
      const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
      const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
      expect(result.findings.some(f => f.kind === kind)).toBe(true)
    })
  }
})

// ── LeakageAssessmentService: detector unavailable ────────────────────────────

describe('LeakageAssessmentService: detector unavailable', () => {
  it('unavailable detector produces INCONCLUSIVE finding, not silent pass', async () => {
    const unavailableDet = makeDetector('DIRECT_RECORD', 'HIGH', false, false)
    const svc = LeakageAssessmentService([unavailableDet])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(result.outcome).toBe('INCONCLUSIVE')
    expect(result.unavailableDetectorIds).toContain('det-DIRECT_RECORD')
  })
})

// ── LeakageAssessmentService: blocking severity ───────────────────────────────

describe('LeakageAssessmentService: blocking severity', () => {
  it('HIGH severity finding sets outcome to BLOCKS_ADMISSION', async () => {
    const svc = LeakageAssessmentService([makeDetector('LABEL', 'HIGH', true)])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(result.outcome).toBe('BLOCKS_ADMISSION')
  })

  it('CRITICAL severity finding sets outcome to BLOCKS_ADMISSION', async () => {
    const svc = LeakageAssessmentService([makeDetector('SUBJECT', 'CRITICAL', true)])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(result.outcome).toBe('BLOCKS_ADMISSION')
  })

  it('LOW/MEDIUM severity findings produce FINDINGS_PRESENT (not blocking)', async () => {
    const svc = LeakageAssessmentService([makeDetector('TEMPORAL', 'LOW', true)])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(result.outcome).toBe('FINDINGS_PRESENT')
  })
})

// ── LeakageAssessmentService: deterministic order ─────────────────────────────

describe('LeakageAssessmentService: deterministic detector order', () => {
  it('detectors run in registration order, results are stable', async () => {
    const d1 = makeDetector('DIRECT_RECORD', 'LOW', true)
    const d2 = makeDetector('FEATURE', 'MEDIUM', true)
    const svc = LeakageAssessmentService([d1, d2])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const r1 = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    const r2 = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(r1.findings.map(f => f.kind)).toEqual(r2.findings.map(f => f.kind))
  })
})

// ── LeakageAssessmentService: no automatic mutation ───────────────────────────

describe('LeakageAssessmentService: findings never rewrite partitions', () => {
  it('partitions unchanged after assessment with findings', async () => {
    const svc = LeakageAssessmentService([makeDetector('LABEL', 'HIGH', true)])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const originalHash = partitions[0]!.contentHash
    await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(partitions[0]!.contentHash).toBe(originalHash)
    expect(partitions[0]!.purpose).toBe('TRAIN')
  })
})

// ── LeakageAssessmentResult structure ─────────────────────────────────────────

describe('LeakageAssessmentResult', () => {
  it('result contains reportHash, assessedAt, and datasetId', async () => {
    const svc = LeakageAssessmentService([makeDetector('DIRECT_RECORD', 'LOW', false)])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(result.datasetId).toBe('ds-001')
    expect(result.assessedAt).toBe('2024-01-01T00:00:00.000Z')
    expect(typeof result.reportHash).toBe('string')
    expect(result.reportHash).toMatch(/^sha256:/)
  })

  it('result contains no raw partition data (only references)', async () => {
    const svc = LeakageAssessmentService([makeDetector('DIRECT_RECORD', 'HIGH', true)])
    const partitions = [makePartition('p-1', 'ds-001', 'TRAIN')]
    const result = await svc.assess('ds-001' as DatasetId, partitions, '2024-01-01T00:00:00.000Z' as DatasetIsoTimestamp)
    expect(Object.keys(result)).not.toContain('rawPartitionData')
    expect(result.findings.every(f => typeof f.evidenceRef === 'string')).toBe(true)
  })
})
