import { describe, it, expect } from 'vitest'
import { NullCertificationStore, applyQuery } from '../store/null-certification-store.js'
import type { CertificationReport } from '@rohinik-org/compiler'

function makeReport(id: string, overallStatus: CertificationReport['summary']['overallStatus'] = 'PASS'): CertificationReport {
  return {
    reportId: id,
    version: '0.1.0',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    results: [],
    summary: { totalScenarios: 0, passed: 0, failed: 0, warned: 0, skipped: 0, overallStatus },
    violations: [],
  }
}

describe('NullCertificationStore', () => {
  it('save and get round-trips', async () => {
    const store = new NullCertificationStore()
    const report = makeReport('r1')
    await store.save(report)
    expect(await store.get('r1')).toBe(report)
  })

  it('list returns all saved reports', async () => {
    const store = new NullCertificationStore()
    await store.save(makeReport('r1'))
    await store.save(makeReport('r2'))
    expect((await store.list()).length).toBe(2)
  })

  it('latest returns most recently finished report', async () => {
    const store = new NullCertificationStore()
    const old = { ...makeReport('old'), finishedAt: '2026-01-01T00:00:00.000Z' }
    const recent = { ...makeReport('recent'), finishedAt: '2026-01-02T00:00:00.000Z' }
    await store.save(old)
    await store.save(recent)
    expect((await store.latest())!.reportId).toBe('recent')
  })

  it('search filters by status', async () => {
    const store = new NullCertificationStore()
    await store.save(makeReport('r1', 'PASS'))
    await store.save(makeReport('r2', 'FAIL'))
    const results = await store.search({ status: 'PASS' })
    expect(results.length).toBe(1)
    expect(results[0]!.reportId).toBe('r1')
  })

  it('applyQuery limit respected', () => {
    const reports = [makeReport('r1'), makeReport('r2'), makeReport('r3')]
    expect(applyQuery(reports, { limit: 2 }).length).toBe(2)
  })
})
