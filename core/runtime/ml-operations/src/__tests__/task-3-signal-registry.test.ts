import { describe, it, expect } from 'vitest'
import type { DeploymentId, ModelId, IsoTimestamp, ContentHash, DriftSignalId } from '@rohinik-org/ml-ir'
import {
  buildDriftSignalRecord,
  type DriftSignalRecord,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const LATER = '2024-06-02T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const DEP  = 'dep-1' as DeploymentId
const SID  = 'sig-1' as DriftSignalId

// ── buildDriftSignalRecord ────────────────────────────────────────────────────

describe('buildDriftSignalRecord', () => {
  it('valid record has signalHash', () => {
    const r = buildDriftSignalRecord({
      signalId: SID, deploymentId: DEP, driftType: 'INPUT',
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      registeredAt: NOW, registeredBy: 'p',
    })
    expect(r.signalId).toBe(SID)
    expect(r.signalHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('signalHash is deterministic', () => {
    const input = {
      signalId: SID, deploymentId: DEP, driftType: 'FEATURE' as const,
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      registeredAt: NOW, registeredBy: 'p',
    }
    expect(buildDriftSignalRecord(input).signalHash).toBe(buildDriftSignalRecord(input).signalHash)
  })

  it('all five drift types accepted', () => {
    for (const t of ['INPUT', 'FEATURE', 'OUTPUT', 'PERFORMANCE', 'CONCEPT'] as const) {
      const r = buildDriftSignalRecord({
        signalId: `sig-${t}` as DriftSignalId, deploymentId: DEP, driftType: t,
        baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
        baselineHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
        registeredAt: NOW, registeredBy: 'p',
      })
      expect(r.driftType).toBe(t)
    }
  })

  it('missing evidenceRef throws OPERATIONS_MISSING_EVIDENCE', () => {
    expect(() => buildDriftSignalRecord({
      signalId: SID, deploymentId: DEP, driftType: 'OUTPUT',
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: undefined as any,
      registeredAt: NOW, registeredBy: 'p',
    })).toThrow('OPERATIONS_MISSING_EVIDENCE')
  })

  it('missing baselineHash throws OPERATIONS_MISSING_BASELINE', () => {
    expect(() => buildDriftSignalRecord({
      signalId: SID, deploymentId: DEP, driftType: 'CONCEPT',
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: '' as ContentHash, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      registeredAt: NOW, registeredBy: 'p',
    })).toThrow('OPERATIONS_MISSING_BASELINE')
  })

  it('idempotent: same signalId same input', () => {
    const store = new Map<string, DriftSignalRecord>()
    const input = {
      signalId: SID, deploymentId: DEP, driftType: 'PERFORMANCE' as const,
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      registeredAt: NOW, registeredBy: 'p',
    }
    const r1 = buildDriftSignalRecord(input, store)
    const r2 = buildDriftSignalRecord(input, store)
    expect(r1.signalHash).toBe(r2.signalHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same signalId different driftType throws OPERATIONS_MISSING_DRIFT_SIGNAL', () => {
    const store = new Map<string, DriftSignalRecord>()
    const base = {
      signalId: SID, deploymentId: DEP,
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      registeredAt: NOW, registeredBy: 'p',
    }
    buildDriftSignalRecord({ ...base, driftType: 'INPUT' }, store)
    expect(() => buildDriftSignalRecord({ ...base, driftType: 'OUTPUT' }, store))
      .toThrow('OPERATIONS_MISSING_DRIFT_SIGNAL')
  })

  it('no rawPayload or secret fields', () => {
    const r = buildDriftSignalRecord({
      signalId: SID, deploymentId: DEP, driftType: 'CONCEPT',
      baselineWindowId: 'w-bl', observationWindowId: 'w-obs',
      baselineHash: HASH, evidenceRef: { evidenceId: 'ev-1', evidenceHash: HASH },
      registeredAt: NOW, registeredBy: 'p',
    })
    expect('rawPayload' in r).toBe(false)
    expect('secret' in r).toBe(false)
  })
})
