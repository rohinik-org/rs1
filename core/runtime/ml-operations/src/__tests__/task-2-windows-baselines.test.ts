import { describe, it, expect } from 'vitest'
import type { DeploymentId, ModelId, IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  validateObservationWindow,
  buildWindowRecord,
  buildBaselineRecord,
  type ObservationWindowRecord,
  type DriftBaselineRecord,
  OPERATIONS_GOVERNANCE_ERROR_CODES,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const LATER = '2024-06-02T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const MOD  = 'model-1' as ModelId

// ── validateObservationWindow ─────────────────────────────────────────────────

describe('validateObservationWindow', () => {
  it('valid window passes', () => {
    expect(() => validateObservationWindow({ startAt: NOW, endAt: LATER })).not.toThrow()
  })

  it('empty window (startAt === endAt) throws OPERATIONS_WINDOW_INVALID', () => {
    expect(() => validateObservationWindow({ startAt: NOW, endAt: NOW }))
      .toThrow('OPERATIONS_WINDOW_INVALID')
  })

  it('inverted window throws OPERATIONS_WINDOW_INVALID', () => {
    expect(() => validateObservationWindow({ startAt: LATER, endAt: NOW }))
      .toThrow('OPERATIONS_WINDOW_INVALID')
  })

  it('missing startAt throws OPERATIONS_WINDOW_INVALID', () => {
    expect(() => validateObservationWindow({ startAt: '' as IsoTimestamp, endAt: LATER }))
      .toThrow('OPERATIONS_WINDOW_INVALID')
  })
})

// ── buildWindowRecord ─────────────────────────────────────────────────────────

describe('buildWindowRecord', () => {
  it('valid record has windowHash', () => {
    const r = buildWindowRecord({
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: { startAt: NOW, endAt: LATER }, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    })
    expect(r.windowId).toBe('w-1')
    expect(r.windowHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('windowHash is deterministic', () => {
    const input = {
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: { startAt: NOW, endAt: LATER }, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    }
    expect(buildWindowRecord(input).windowHash).toBe(buildWindowRecord(input).windowHash)
  })

  it('different windows produce different hashes', () => {
    const base = {
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, createdAt: NOW, createdBy: 'p',
    }
    const r1 = buildWindowRecord({ ...base, window: { startAt: NOW, endAt: LATER } })
    const r2 = buildWindowRecord({ ...base, window: { startAt: NOW, endAt: '2024-06-03T12:00:00.000Z' as IsoTimestamp } })
    expect(r1.windowHash).not.toBe(r2.windowHash)
  })

  it('inverted window throws OPERATIONS_WINDOW_INVALID', () => {
    expect(() => buildWindowRecord({
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: { startAt: LATER, endAt: NOW },
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    })).toThrow('OPERATIONS_WINDOW_INVALID')
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildWindowRecord({
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: { startAt: NOW, endAt: LATER },
      evidenceRef: undefined as any,
      createdAt: NOW, createdBy: 'p',
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('idempotent: same windowId same input returns same hash', () => {
    const store = new Map<string, ObservationWindowRecord>()
    const input = {
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: { startAt: NOW, endAt: LATER }, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    }
    const r1 = buildWindowRecord(input, store)
    const r2 = buildWindowRecord(input, store)
    expect(r1.windowHash).toBe(r2.windowHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same windowId different window throws OPERATIONS_WINDOW_INVALID', () => {
    const store = new Map<string, ObservationWindowRecord>()
    const base = {
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH }, createdAt: NOW, createdBy: 'p',
    }
    buildWindowRecord({ ...base, window: { startAt: NOW, endAt: LATER } }, store)
    expect(() => buildWindowRecord({ ...base, window: { startAt: NOW, endAt: '2024-06-03T12:00:00.000Z' as IsoTimestamp } }, store))
      .toThrow('OPERATIONS_WINDOW_INVALID')
  })

  it('record has no rawPayload or secret fields', () => {
    const r = buildWindowRecord({
      windowId: 'w-1', deploymentId: DEP, modelId: MOD,
      window: { startAt: NOW, endAt: LATER }, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    })
    expect('rawPayload' in r).toBe(false)
    expect('secret' in r).toBe(false)
  })
})

// ── buildBaselineRecord ───────────────────────────────────────────────────────

describe('buildBaselineRecord', () => {
  it('valid record has baselineHash', () => {
    const b = buildBaselineRecord({
      baselineId: 'bl-1', deploymentId: DEP, modelId: MOD, driftType: 'INPUT',
      window: { startAt: NOW, endAt: LATER },
      contentHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    })
    expect(b.baselineId).toBe('bl-1')
    expect(b.baselineHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('baselineHash is deterministic', () => {
    const input = {
      baselineId: 'bl-1', deploymentId: DEP, modelId: MOD, driftType: 'INPUT' as const,
      window: { startAt: NOW, endAt: LATER },
      contentHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    }
    expect(buildBaselineRecord(input).baselineHash).toBe(buildBaselineRecord(input).baselineHash)
  })

  it('all five drift types accepted', () => {
    for (const t of ['INPUT', 'FEATURE', 'OUTPUT', 'PERFORMANCE', 'CONCEPT'] as const) {
      const b = buildBaselineRecord({
        baselineId: `bl-${t}`, deploymentId: DEP, modelId: MOD, driftType: t,
        window: { startAt: NOW, endAt: LATER },
        contentHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
        createdAt: NOW, createdBy: 'p',
      })
      expect(b.driftType).toBe(t)
    }
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildBaselineRecord({
      baselineId: 'bl-1', deploymentId: DEP, modelId: MOD, driftType: 'OUTPUT',
      window: { startAt: NOW, endAt: LATER },
      contentHash: HASH, evidenceRef: undefined as any,
      createdAt: NOW, createdBy: 'p',
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('idempotent: same baselineId same input', () => {
    const store = new Map<string, DriftBaselineRecord>()
    const input = {
      baselineId: 'bl-1', deploymentId: DEP, modelId: MOD, driftType: 'PERFORMANCE' as const,
      window: { startAt: NOW, endAt: LATER },
      contentHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      createdAt: NOW, createdBy: 'p',
    }
    const b1 = buildBaselineRecord(input, store)
    const b2 = buildBaselineRecord(input, store)
    expect(b1.baselineHash).toBe(b2.baselineHash)
  })
})
