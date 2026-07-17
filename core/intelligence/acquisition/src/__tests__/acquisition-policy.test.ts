import { describe, it, expect } from 'vitest'
import type { CapabilityCandidate, CapabilityValidationReport, AcquisitionPolicy } from '@rohinik-org/compiler'
import { DEFAULT_ACQUISITION_POLICY } from '@rohinik-org/compiler'
import { AcquisitionPolicyEngine } from '../policy/acquisition-policy-engine.js'

function makeCandidate(overrides: Partial<CapabilityCandidate> = {}): CapabilityCandidate {
  return {
    kind: 'CapabilityCandidate',
    candidateId: 'cand-1',
    queryId: 'q-1',
    sourceId: 'local',
    name: 'test-plugin',
    description: 'x',
    tags: [],
    installSource: { scheme: 'file', location: '/tmp/x' },
    confidence: 0.95,
    producedAt: new Date().toISOString(),
    ...overrides,
  }
}

function passedReport(candidateId = 'cand-1'): CapabilityValidationReport {
  return {
    kind: 'CapabilityValidationReport',
    reportId: 'rep-1',
    candidateId,
    passed: true,
    checks: [{ name: 'name-present', status: 'PASS' }],
    producedAt: new Date().toISOString(),
  }
}

function failedReport(): CapabilityValidationReport {
  return { ...passedReport(), passed: false, checks: [{ name: 'name-present', status: 'FAIL' }] }
}

describe('AcquisitionPolicyEngine', () => {
  const engine = new AcquisitionPolicyEngine()

  it('local source with autoApproveLocalSources → APPROVED', () => {
    const approval = engine.decide(makeCandidate(), passedReport(), DEFAULT_ACQUISITION_POLICY)
    expect(approval.decision).toBe('APPROVED')
  })

  it('network source with requireHumanApproval → DEFERRED', () => {
    const candidate = makeCandidate({ sourceId: 'npm', installSource: { scheme: 'npm', location: 'some-pkg' } })
    const approval = engine.decide(candidate, passedReport(), DEFAULT_ACQUISITION_POLICY)
    expect(approval.decision).toBe('DEFERRED')
  })

  it('blocked source → REJECTED', () => {
    const policy: AcquisitionPolicy = { ...DEFAULT_ACQUISITION_POLICY, blockedSources: ['evil'] }
    const candidate = makeCandidate({ sourceId: 'evil' })
    const approval = engine.decide(candidate, passedReport(), policy)
    expect(approval.decision).toBe('REJECTED')
  })

  it('low confidence → DEFERRED', () => {
    const approval = engine.decide(makeCandidate({ confidence: 0.5 }), passedReport(), DEFAULT_ACQUISITION_POLICY)
    expect(approval.decision).toBe('DEFERRED')
  })

  it('failed validation → REJECTED', () => {
    const approval = engine.decide(makeCandidate(), failedReport(), DEFAULT_ACQUISITION_POLICY)
    expect(approval.decision).toBe('REJECTED')
  })

  it('decidedBy is always POLICY', () => {
    const approval = engine.decide(makeCandidate(), passedReport(), DEFAULT_ACQUISITION_POLICY)
    expect(approval.decidedBy).toBe('POLICY')
  })
})
