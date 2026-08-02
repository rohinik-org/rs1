import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildAdaptationEvidenceCorpus,
  buildAdaptationOpportunity,
  type AdaptationEvidenceCorpusInput,
  type AdaptationOpportunityInput,
  type AdaptationEvidenceCorpus,
  type AdaptationOpportunity,
} from '../../src/index.js'

const NOW   = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const START = '2024-05-01T00:00:00.000Z' as IsoTimestamp
const END   = '2024-05-31T23:59:59.000Z' as IsoTimestamp
const HASH  = `sha256:${'a'.repeat(64)}` as ContentHash
const EV    = { evidenceId: 'ev-1', evidenceHash: HASH }

function makeCorpusInput(overrides?: Partial<AdaptationEvidenceCorpusInput>): AdaptationEvidenceCorpusInput {
  return {
    corpusId: 'corpus-1',
    scope: 'ROUTING_POLICY',
    observationPeriod: { startAt: START, endAt: END },
    executionEvidenceRefs: [EV],
    evaluationEvidenceRefs: [],
    reliabilityEvidenceRefs: [],
    routingEvidenceRefs: [],
    economicsEvidenceRefs: [],
    policyEvidenceRefs: [],
    sealedAt: NOW,
    sealedBy: 'test',
    ...overrides,
  }
}

// ── buildAdaptationEvidenceCorpus ─────────────────────────────────────────────

describe('buildAdaptationEvidenceCorpus', () => {
  it('valid corpus has corpusHash', () => {
    const c = buildAdaptationEvidenceCorpus(makeCorpusInput())
    expect(c.corpusId).toBe('corpus-1')
    expect(c.corpusHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('corpusHash is deterministic', () => {
    const input = makeCorpusInput()
    expect(buildAdaptationEvidenceCorpus(input).corpusHash)
      .toBe(buildAdaptationEvidenceCorpus(input).corpusHash)
  })

  it('unsealed corpus (no sealedAt) throws GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationEvidenceCorpus(makeCorpusInput({ sealedAt: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('empty all evidence refs is incomplete', () => {
    const c = buildAdaptationEvidenceCorpus(makeCorpusInput({
      executionEvidenceRefs: [],
    }))
    expect(c.authoritative).toBe(false)
  })

  it('corpus with evidence is authoritative', () => {
    const c = buildAdaptationEvidenceCorpus(makeCorpusInput())
    expect(c.authoritative).toBe(true)
  })

  it('stale corpus (endAt older than now) marks not authoritative', () => {
    const c = buildAdaptationEvidenceCorpus(makeCorpusInput({
      observationPeriod: { startAt: '2020-01-01T00:00:00.000Z' as IsoTimestamp, endAt: '2020-01-02T00:00:00.000Z' as IsoTimestamp },
      stalenessThresholdMs: 1000,
    }))
    expect(c.authoritative).toBe(false)
  })

  it('vendor-only corpus not authoritative', () => {
    const c = buildAdaptationEvidenceCorpus(makeCorpusInput({ vendorClaimsOnly: true }))
    expect(c.authoritative).toBe(false)
  })

  it('self-evidence corpus not authoritative', () => {
    const c = buildAdaptationEvidenceCorpus(makeCorpusInput({ selfEvidenceOnly: true }))
    expect(c.authoritative).toBe(false)
  })

  it('idempotent: same corpusId same input', () => {
    const store = new Map()
    const input = makeCorpusInput()
    const c1 = buildAdaptationEvidenceCorpus(input, store)
    const c2 = buildAdaptationEvidenceCorpus(input, store)
    expect(c1.corpusHash).toBe(c2.corpusHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same corpusId different scope throws', () => {
    const store = new Map()
    buildAdaptationEvidenceCorpus(makeCorpusInput({ scope: 'ROUTING_POLICY' }), store)
    expect(() => buildAdaptationEvidenceCorpus(makeCorpusInput({ scope: 'PLANNING_POLICY' }), store))
      .toThrow()
  })

  it('corpus has no proposal authority', () => {
    const c = buildAdaptationEvidenceCorpus(makeCorpusInput()) as any
    expect('proposeAdaptation' in c).toBe(false)
    expect('createProposal' in c).toBe(false)
  })
})

// ── buildAdaptationOpportunity ────────────────────────────────────────────────

describe('buildAdaptationOpportunity', () => {
  it('valid opportunity has opportunityHash', () => {
    const corpus = buildAdaptationEvidenceCorpus(makeCorpusInput())
    const opp = buildAdaptationOpportunity({
      opportunityId: 'opp-1',
      corpusId: 'corpus-1',
      corpusHash: corpus.corpusHash,
      kind: 'ROUTING_POLICY',
      rationale: 'observed latency regression',
      detectedAt: NOW,
      detectedBy: 'detector',
    })
    expect(opp.opportunityId).toBe('opp-1')
    expect(opp.opportunityHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('non-authoritative corpus cannot produce opportunity', () => {
    const corpus = buildAdaptationEvidenceCorpus(makeCorpusInput({ executionEvidenceRefs: [] }))
    expect(corpus.authoritative).toBe(false)
    expect(() => buildAdaptationOpportunity({
      opportunityId: 'opp-2',
      corpusId: 'corpus-1',
      corpusHash: corpus.corpusHash,
      kind: 'ROUTING_POLICY',
      rationale: 'test',
      detectedAt: NOW,
      detectedBy: 'detector',
      corpusAuthoritative: false,
    })).toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('opportunity has no proposal authority', () => {
    const corpus = buildAdaptationEvidenceCorpus(makeCorpusInput())
    const opp = buildAdaptationOpportunity({
      opportunityId: 'opp-3',
      corpusId: 'corpus-1',
      corpusHash: corpus.corpusHash,
      kind: 'ROUTING_POLICY',
      rationale: 'test',
      detectedAt: NOW,
      detectedBy: 'detector',
    }) as any
    expect('proposeAdaptation' in opp).toBe(false)
  })
})
