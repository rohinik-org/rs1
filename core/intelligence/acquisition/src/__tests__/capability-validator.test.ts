import { describe, it, expect } from 'vitest'
import type { CapabilityCandidate } from '@rohinik-org/compiler'
import { CapabilityValidator } from '../validation/capability-validator.js'

function makeCandidate(overrides: Partial<CapabilityCandidate> = {}): CapabilityCandidate {
  return {
    kind: 'CapabilityCandidate',
    candidateId: 'cand-1',
    queryId: 'q-1',
    sourceId: 'local',
    name: 'my-plugin',
    description: 'A plugin',
    tags: [],
    installSource: { scheme: 'file', location: '/tmp/plugin' },
    confidence: 0.9,
    producedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('CapabilityValidator', () => {
  it('all checks pass for valid candidate', () => {
    const report = new CapabilityValidator().validate(makeCandidate())
    expect(report.passed).toBe(true)
    expect(report.checks.every(c => c.status === 'PASS')).toBe(true)
  })

  it('name-present fails for empty name', () => {
    const report = new CapabilityValidator().validate(makeCandidate({ name: '' }))
    expect(report.passed).toBe(false)
    const check = report.checks.find(c => c.name === 'name-present')
    expect(check?.status).toBe('FAIL')
  })

  it('source-scheme fails for unknown scheme', () => {
    const report = new CapabilityValidator().validate(makeCandidate({ installSource: { scheme: 'ftp', location: '/x' } }))
    expect(report.passed).toBe(false)
    const check = report.checks.find(c => c.name === 'source-scheme')
    expect(check?.status).toBe('FAIL')
  })

  it('sandbox check always PASS (stub)', () => {
    const report = new CapabilityValidator().validate(makeCandidate())
    const check = report.checks.find(c => c.name === 'sandbox')
    expect(check?.status).toBe('PASS')
  })

  it('passed is false if any check fails', () => {
    const report = new CapabilityValidator().validate(makeCandidate({ confidence: 0.1 }))
    expect(report.passed).toBe(false)
  })

  it('candidateId in report matches input', () => {
    const report = new CapabilityValidator().validate(makeCandidate({ candidateId: 'cand-xyz' }))
    expect(report.candidateId).toBe('cand-xyz')
  })
})
