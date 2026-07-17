import { describe, it, expect } from 'vitest'
import { WorkflowMatcher } from '../matching/workflow-matcher.js'
import type { WorkflowRepository } from '../matching/workflow-repository.js'
import type { StructuredIntent, WorkflowDescriptor } from '@rohinik-org/compiler'

function makeDescriptor(id: string, skills: string[]): WorkflowDescriptor {
  return {
    kind: 'WorkflowDescriptor',
    schemaVersion: '1.0',
    workflowId: id,
    version: 1,
    status: 'ACTIVE',
    definition: {
      name: skills.join(' → '),
      steps: skills.map((skillId, i) => ({
        skillId,
        position: i,
        statistics: { executionCount: 10, outcomeDistribution: { SUCCESS: 10, FAILED: 0, NO_ROUTE: 0, TIMEOUT: 0 }, averageLatencyMs: 100 },
      })),
    },
    statistics: { confidence: 0.9, successRate: 1.0, averageLatencyMs: 300, evidence: { executionCount: 10, successfulExecutions: 10, failedExecutions: 0, uniqueSessions: 5 } },
    lineage: { derivedFromCandidateSetId: 'cs-1', approvalId: 'ap-1', approvalPolicyId: 'pol-1', graphRevision: 1, corpusRevision: 1, discoveredAt: '2026-01-01T00:00:00.000Z' },
  }
}

function makeRepo(descriptors: WorkflowDescriptor[]): WorkflowRepository {
  return {
    findAll: async () => descriptors,
    findBySkill: async (skillId) => descriptors.filter(d => d.definition.steps.some(s => s.skillId === skillId)),
    findById: async (id) => descriptors.find(d => d.workflowId === id),
  }
}

function makeIntent(concepts: string[]): StructuredIntent {
  return {
    intentId: 'test-intent',
    schemaVersion: '1.0',
    rawInput: concepts.join(' '),
    concepts,
    preferredSkills: [],
    constraints: {},
    translatedBy: 'StaticIntentTranslator',
    translationConfidence: 1.0,
    unresolvedTerms: [],
  }
}

describe('WorkflowMatcher', () => {
  it('returns evidence for matching workflow', async () => {
    const repo = makeRepo([makeDescriptor('wf-1', ['skill-read', 'skill-transform'])])
    const matcher = new WorkflowMatcher(repo)
    const evidence = await matcher.match(makeIntent(['read', 'transform']))
    expect(evidence.length).toBe(1)
    expect(evidence[0]!.workflowId).toBe('wf-1')
    expect(evidence[0]!.rawMatchScore).toBeGreaterThan(0)
  })

  it('returns empty array when no workflows match', async () => {
    const repo = makeRepo([makeDescriptor('wf-1', ['skill-unrelated'])])
    const matcher = new WorkflowMatcher(repo)
    const evidence = await matcher.match(makeIntent(['read', 'transform']))
    expect(evidence.length).toBe(0)
  })

  it('records matched and unmatched concepts', async () => {
    const repo = makeRepo([makeDescriptor('wf-1', ['skill-read', 'skill-transform'])])
    const matcher = new WorkflowMatcher(repo)
    const evidence = await matcher.match(makeIntent(['read', 'transform', 'deploy']))
    expect(evidence[0]!.matchedConcepts.length).toBeGreaterThan(0)
    expect(evidence[0]!.unmatchedConcepts).toContain('deploy')
  })
})
