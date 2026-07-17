import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { RequestIdChainResolver } from '../chain/request-id-chain-resolver.js'
import { SlidingWindowExtractor } from '../discovery/sliding-window-extractor.js'
import { DefaultWorkflowConfidenceStrategy } from '../scoring/default-confidence-strategy.js'
import { WorkflowDiscoveryEngine } from '../discovery/workflow-discovery-engine.js'
import { AutoApprovalPolicy } from '../policy/auto-approval-policy.js'
import { JsonWorkflowStore } from '../store/json-workflow-store.js'
import type { ExecutionRecord, WorkflowDescriptor, ExecutionOutcome } from '@rohinik-org/compiler'

const roots: string[] = []
async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `wf-integration-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}
afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

function makeRecord(sessionId: string, step: number, skillId: string): ExecutionRecord {
  return {
    kind: 'ExecutionRecord', schemaVersion: '1.0',
    recordId: `${sessionId}-r${step}`, runtimeId: 'rt',
    timestamp: new Date(Date.now() + step * 1000).toISOString(),
    requestId: `${sessionId}-step${step}`,
    requestHash: 'h', contentType: 'text/plain', requestSizeBytes: 10,
    outcome: 'SUCCESS', winnerSkillId: skillId, winnerTierId: 'tier1',
    allCandidates: [], reasoningInvoked: false, retried: false, retryCount: 0,
    totalLatencyMs: 200, tierLatencies: [], providerResolutions: [],
    sourceTraceId: `${sessionId}-step${step}`, runtimeVersion: '1.0.0',
  }
}

describe('Workflow discovery — end to end pipeline', () => {
  it('discovers and stores a workflow from 15 repeating sessions', async () => {
    const root = await tmpRoot()

    // 15 sessions each with the same 3-step sequence
    const records: ExecutionRecord[] = []
    for (let i = 0; i < 15; i++) {
      records.push(makeRecord(`session-${i}`, 0, 'skill-read'))
      records.push(makeRecord(`session-${i}`, 1, 'skill-transform'))
      records.push(makeRecord(`session-${i}`, 2, 'skill-write'))
    }

    // Pipeline
    const resolver = new RequestIdChainResolver()
    const chains = resolver.resolve(records)
    expect(chains).toHaveLength(15)

    const engine = new WorkflowDiscoveryEngine(new SlidingWindowExtractor(), new DefaultWorkflowConfidenceStrategy())
    const candidateSet = await engine.discover(chains, { minSupport: 10, minConfidence: 0.5, maxChainLength: 4 })
    expect(candidateSet.candidates.length).toBeGreaterThan(0)
    expect(candidateSet.recordsScanned).toBe(45)
    expect(candidateSet.chainsGenerated).toBe(15)

    const store = new JsonWorkflowStore(root)
    await store.saveCandidateSet(candidateSet)

    const policy = new AutoApprovalPolicy(0.5)
    const approval = await policy.review(candidateSet)
    await store.saveApproval(approval)

    const approvedIds = new Set(approval.decisions.filter(d => d.decision === 'APPROVED').map(d => d.candidateId))

    for (const candidate of candidateSet.candidates) {
      if (!approvedIds.has(candidate.definition.candidateId)) continue
      const descriptor: WorkflowDescriptor = {
        kind: 'WorkflowDescriptor',
        schemaVersion: '1.0',
        workflowId: candidate.definition.candidateId,
        version: 1,
        status: 'ACTIVE',
        definition: {
          name: candidate.definition.steps.map(s => s.skillId).join(' → '),
          steps: candidate.definition.steps,
        },
        statistics: {
          confidence: candidate.statistics.confidence,
          successRate: candidate.statistics.successRate,
          averageLatencyMs: candidate.statistics.averageLatencyMs,
          evidence: candidate.evidence,
        },
        lineage: {
          derivedFromCandidateSetId: candidateSet.candidateSetId,
          approvalId: approval.approvalId,
          approvalPolicyId: approval.policyId,
          graphRevision: 0,
          corpusRevision: 0,
          discoveredAt: candidateSet.producedAt,
        },
      }
      await store.save(descriptor)
    }

    const stored = await store.list()
    expect(stored.length).toBeGreaterThan(0)

    // The 3-step workflow should be stored
    const fullWorkflow = stored.find(w => w.definition.steps.length === 3)
    expect(fullWorkflow).toBeDefined()
    expect(fullWorkflow!.definition.steps.map(s => s.skillId)).toEqual(['skill-read', 'skill-transform', 'skill-write'])
    expect(fullWorkflow!.statistics.confidence).toBeGreaterThan(0)

    // findBySkill works
    const found = await store.findBySkill('skill-read')
    expect(found.length).toBeGreaterThan(0)
  })
})
