import { describe, it, expect } from 'vitest'
import type { IsoTimestamp, ContentHash } from '@rohinik-org/ml-ir'
import {
  buildAdaptationProposal,
  buildAdaptationCandidateVersion,
  type AdaptationProposalInput,
  type AdaptationCandidateVersionInput,
  type AdaptationKind,
} from '../../src/index.js'

const NOW  = '2024-06-01T12:00:00.000Z' as IsoTimestamp
const HASH = `sha256:${'a'.repeat(64)}` as ContentHash
const EV   = { evidenceId: 'ev-1', evidenceHash: HASH }

function makeProposalInput(overrides?: Partial<AdaptationProposalInput>): AdaptationProposalInput {
  return {
    proposalId: 'prop-1' as any,
    adaptationId: 'adapt-1' as any,
    opportunityId: 'opp-1' as any,
    opportunityHash: HASH,
    corpusId: 'corpus-1',
    corpusHash: HASH,
    kind: 'ROUTING_POLICY' as AdaptationKind,
    proposedBy: 'optimiser',
    proposedAt: NOW,
    evidenceRef: EV,
    rationale: 'reduce latency',
    expectedBenefit: 'p50 latency -10ms (hypothesis)',
    riskHypothesis: 'possible quality regression at edge',
    ...overrides,
  }
}

// ── buildAdaptationProposal ───────────────────────────────────────────────────

describe('buildAdaptationProposal', () => {
  it('valid proposal has proposalHash', () => {
    const p = buildAdaptationProposal(makeProposalInput())
    expect(p.proposalId).toBe('prop-1')
    expect(p.proposalHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('proposalHash is deterministic', () => {
    const input = makeProposalInput()
    expect(buildAdaptationProposal(input).proposalHash)
      .toBe(buildAdaptationProposal(input).proposalHash)
  })

  it('all 8 adaptation kinds accepted', () => {
    const kinds: AdaptationKind[] = [
      'ROUTING_POLICY', 'PLANNING_POLICY', 'ECONOMICS_CALIBRATION',
      'RELIABILITY_WEIGHTING', 'PROMPT_POLICY', 'AGENT_POLICY',
      'EXECUTION_POLICY', 'LEARNED_OPTIMISATION_METADATA',
    ]
    for (const kind of kinds) {
      const p = buildAdaptationProposal(makeProposalInput({ kind, proposalId: `prop-${kind}` as any }))
      expect(p.kind).toBe(kind)
    }
  })

  it('missing corpus throws GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationProposal(makeProposalInput({ corpusHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('missing opportunity throws GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationProposal(makeProposalInput({ opportunityHash: undefined as any })))
      .toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('proposal has no admission/deployment fields', () => {
    const p = buildAdaptationProposal(makeProposalInput()) as any
    expect('admissionId' in p).toBe(false)
    expect('deploymentId' in p).toBe(false)
    expect('activate' in p).toBe(false)
  })

  it('model-weight mutation kind throws GOVERNED_LEARNING_DIRECT_MUTATION', () => {
    expect(() => buildAdaptationProposal(makeProposalInput({ kind: 'MODEL_WEIGHT' as any })))
      .toThrow('GOVERNED_LEARNING_DIRECT_MUTATION')
  })

  it('idempotent: same proposalId same input', () => {
    const store = new Map()
    const input = makeProposalInput()
    const p1 = buildAdaptationProposal(input, store)
    const p2 = buildAdaptationProposal(input, store)
    expect(p1.proposalHash).toBe(p2.proposalHash)
    expect(store.size).toBe(1)
  })

  it('conflict: same proposalId different kind throws', () => {
    const store = new Map()
    buildAdaptationProposal(makeProposalInput({ kind: 'ROUTING_POLICY' }), store)
    expect(() => buildAdaptationProposal(makeProposalInput({ kind: 'PLANNING_POLICY' }), store))
      .toThrow()
  })
})

// ── buildAdaptationCandidateVersion ──────────────────────────────────────────

describe('buildAdaptationCandidateVersion', () => {
  it('valid candidate has versionHash', () => {
    const v = buildAdaptationCandidateVersion({
      versionId: 'ver-1' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      adaptationId: 'adapt-1' as any,
      kind: 'ROUTING_POLICY',
      candidateConfiguration: { routingWeightAdjustment: 0.05 },
      protectedInvariants: ['privacy', 'policy', 'eligibility', 'trust'],
      rollbackProjection: { targetVersionId: 'ver-0' as any },
      createdAt: NOW,
      createdBy: 'optimiser',
    })
    expect(v.versionId).toBe('ver-1')
    expect(v.versionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('missing proposal throws GOVERNED_LEARNING_MISSING_EVIDENCE', () => {
    expect(() => buildAdaptationCandidateVersion({
      versionId: 'ver-2' as any,
      proposalId: 'prop-1' as any,
      proposalHash: undefined as any,
      adaptationId: 'adapt-1' as any,
      kind: 'ROUTING_POLICY',
      candidateConfiguration: {},
      protectedInvariants: [],
      rollbackProjection: { targetVersionId: 'ver-0' as any },
      createdAt: NOW,
      createdBy: 'optimiser',
    })).toThrow('GOVERNED_LEARNING_MISSING_EVIDENCE')
  })

  it('candidate with no rollback projection throws GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE', () => {
    expect(() => buildAdaptationCandidateVersion({
      versionId: 'ver-3' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      adaptationId: 'adapt-1' as any,
      kind: 'ROUTING_POLICY',
      candidateConfiguration: {},
      protectedInvariants: [],
      rollbackProjection: undefined as any,
      createdAt: NOW,
      createdBy: 'optimiser',
    })).toThrow('GOVERNED_LEARNING_ROLLBACK_UNAVAILABLE')
  })

  it('candidate is a full version, not an in-place patch', () => {
    const v = buildAdaptationCandidateVersion({
      versionId: 'ver-4' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      adaptationId: 'adapt-1' as any,
      kind: 'PLANNING_POLICY',
      candidateConfiguration: { planningDepth: 3 },
      protectedInvariants: ['privacy'],
      rollbackProjection: { targetVersionId: 'ver-0' as any },
      createdAt: NOW,
      createdBy: 'optimiser',
    })
    expect(v.candidateConfiguration).toBeDefined()
    expect(v.protectedInvariants).toContain('privacy')
  })

  it('versionHash deterministic', () => {
    const input = {
      versionId: 'ver-5' as any,
      proposalId: 'prop-1' as any,
      proposalHash: HASH,
      adaptationId: 'adapt-1' as any,
      kind: 'ROUTING_POLICY' as AdaptationKind,
      candidateConfiguration: {},
      protectedInvariants: [],
      rollbackProjection: { targetVersionId: 'ver-0' as any },
      createdAt: NOW,
      createdBy: 'optimiser',
    }
    expect(buildAdaptationCandidateVersion(input).versionHash)
      .toBe(buildAdaptationCandidateVersion(input).versionHash)
  })
})
