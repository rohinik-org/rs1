import { describe, it, expect } from 'vitest'
import { DecisionBuilder } from '../decision-builder.js'
import { DecisionEvidenceBuilder } from '../decision-evidence-builder.js'
import { makeRequest } from './fixtures.js'
import type { BlockingFinding, DegradingFinding, ManualReviewFinding } from '../types.js'

const db = new DecisionBuilder()
const eb = new DecisionEvidenceBuilder()

function blocking(code: string): BlockingFinding {
  return { kind: 'blocking', code, assessmentType: 'integrity' }
}
function degrading(code: string): DegradingFinding {
  return { kind: 'degrading', code, assessmentType: 'provenance' }
}
function manual(code: string): ManualReviewFinding {
  return { kind: 'manual-review', code, assessmentType: 'publisher' }
}

describe('DecisionBuilder', () => {
  it('trusted decision produced with no findings', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    const r = db.build(req, 'trusted', evidence, [], [], [], [], [])
    expect(r.outcome).toBe('trusted')
    expect(r.decision).toBe('trusted')
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('trusted decision maps to trusted IR decision', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    const r = db.build(req, 'trusted', evidence, [], [], [], [], [])
    expect(r.decision).toBe('trusted')
  })

  it('trusted-degraded maps to conditionally-trusted IR decision', () => {
    const req = makeRequest()
    const degs = [degrading('d1')]
    const evidence = eb.build(req, [], degs, [], [], [], [])
    const r = db.build(req, 'trusted-degraded', evidence, [], degs, [], [], [])
    expect(r.decision).toBe('conditionally-trusted')
  })

  it('rejected maps to denied IR decision', () => {
    const req = makeRequest()
    const blocks = [blocking('b1')]
    const evidence = eb.build(req, blocks, [], [], [], [], [])
    const r = db.build(req, 'rejected', evidence, blocks, [], [], [], [])
    expect(r.decision).toBe('denied')
  })

  it('manual-review-required maps to manual-review-required IR decision', () => {
    const req = makeRequest()
    const reviews = [manual('m1')]
    const evidence = eb.build(req, [], [], reviews, [], [], [])
    const r = db.build(req, 'manual-review-required', evidence, [], [], reviews, [], [])
    expect(r.decision).toBe('manual-review-required')
  })

  it('trusted + blocking finding throws invariant error', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [blocking('b1')], [], [], [], [], [])
    expect(() => db.build(req, 'trusted', evidence, [blocking('b1')], [], [], [], [])).toThrow('Invariant')
  })

  it('trusted + manual-review finding throws invariant error', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [manual('m1')], [], [], [])
    expect(() => db.build(req, 'trusted', evidence, [], [], [manual('m1')], [], [])).toThrow('Invariant')
  })

  it('trusted-degraded without degradation throws invariant error', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    expect(() => db.build(req, 'trusted-degraded', evidence, [], [], [], [], [])).toThrow('Invariant')
  })

  it('rejected without blocking reason throws invariant error', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    expect(() => db.build(req, 'rejected', evidence, [], [], [], [], [])).toThrow('Invariant')
  })

  it('manual-review-required without review reason throws invariant error', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    expect(() => db.build(req, 'manual-review-required', evidence, [], [], [], [], [])).toThrow('Invariant')
  })

  it('output is immutable', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    const r = db.build(req, 'trusted', evidence, [], [], [], [], [])
    expect(Object.isFrozen(r)).toBe(true)
  })

  it('reason codes present in trusted decision', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    const r = db.build(req, 'trusted', evidence, [], [], [], [], [])
    expect(r.reasonCodes.length).toBeGreaterThan(0)
  })

  it('all assessment references included in result', () => {
    const req = makeRequest()
    const evidence = eb.build(req, [], [], [], [], [], [])
    const r = db.build(req, 'trusted', evidence, [], [], [], [], [])
    expect(r.integrityAssessment).toBeDefined()
    expect(r.vulnerabilityAssessment).toBeDefined()
  })
})
