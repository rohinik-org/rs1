import { describe, it, expect, beforeEach } from 'vitest'
import type {
  EvaluationId,
  EvaluationRecord,
  ReliabilityScoreId,
  ReliabilityScore,
  PolicyChangeRequestId,
  PolicyChangeRequest,
} from './index.js'
import {
  EvaluationVerdict,
  EvaluationDimension,
  EvaluationService,
  InMemoryEvaluationRepository,
  ReliabilityService,
  InMemoryReliabilityScoreRepository,
  InMemoryPolicyChangeRequestRepository,
  PolicyChangeStatus,
} from './index.js'
import type { AgentRunId, AgentId, AgentVersionId } from '@rohinik-org/agent-ir'

// ── Helpers ───────────────────────────────────────────────────────────────────

const agentId   = 'agent-001' as unknown as AgentId
const versionId = 'ver-001'   as unknown as AgentVersionId
const runA      = 'run-a'     as unknown as AgentRunId
const runB      = 'run-b'     as unknown as AgentRunId
const runC      = 'run-c'     as unknown as AgentRunId
const evaluatorId = 'eval-human-01'

// ── Task 14: EvaluationVerdict and EvaluationDimension ───────────────────────

describe('agent-evaluation: EvaluationVerdict and EvaluationDimension', () => {
  it('verdict has exactly 3 values: PASS, FAIL, INCONCLUSIVE', () => {
    const verdicts = [
      EvaluationVerdict.PASS,
      EvaluationVerdict.FAIL,
      EvaluationVerdict.INCONCLUSIVE,
    ]
    expect(verdicts).toHaveLength(3)
    expect(Object.values(EvaluationVerdict)).toHaveLength(3)
  })

  it('dimension has exactly 4 values: QUALITY, SAFETY, RELIABILITY, ALIGNMENT', () => {
    const dims = [
      EvaluationDimension.QUALITY,
      EvaluationDimension.SAFETY,
      EvaluationDimension.RELIABILITY,
      EvaluationDimension.ALIGNMENT,
    ]
    expect(dims).toHaveLength(4)
    expect(Object.values(EvaluationDimension)).toHaveLength(4)
  })

  it('execution success is not a verdict — no SUCCESS or EXECUTED kind', () => {
    expect(Object.values(EvaluationVerdict)).not.toContain('SUCCESS')
    expect(Object.values(EvaluationVerdict)).not.toContain('EXECUTED')
    expect(Object.values(EvaluationVerdict)).not.toContain('COMPLETED')
  })
})

// ── Task 14: EvaluationService ────────────────────────────────────────────────

describe('agent-evaluation: EvaluationService', () => {
  let repo: InMemoryEvaluationRepository
  let svc: EvaluationService

  beforeEach(() => {
    repo = new InMemoryEvaluationRepository()
    svc  = new EvaluationService(repo)
  })

  it('record creates an EvaluationRecord with evaluatorId, verdict, dimension', async () => {
    const record = await svc.record({
      agentId,
      versionId,
      runId:      runA,
      dimension:  EvaluationDimension.QUALITY,
      verdict:    EvaluationVerdict.PASS,
      evaluatorId,
      notes:      'output met quality bar',
      evidenceIds: ['ev-001'],
    })
    expect(record.verdict).toBe(EvaluationVerdict.PASS)
    expect(record.dimension).toBe(EvaluationDimension.QUALITY)
    expect(record.evaluatorId).toBe(evaluatorId)
    expect(record.runId).toBe(runA)
    expect(record.evaluatedAt).toBeDefined()
  })

  it('record stores record — loadByRunId returns it', async () => {
    await svc.record({
      agentId, versionId, runId: runA,
      dimension: EvaluationDimension.SAFETY,
      verdict: EvaluationVerdict.FAIL,
      evaluatorId, notes: 'safety breach', evidenceIds: [],
    })
    const records = await repo.loadByRunId(runA)
    expect(records).toHaveLength(1)
    expect(records[0]?.verdict).toBe(EvaluationVerdict.FAIL)
  })

  it('multiple evaluations per run accumulate', async () => {
    await svc.record({ agentId, versionId, runId: runA, dimension: EvaluationDimension.QUALITY,   verdict: EvaluationVerdict.PASS,         evaluatorId, notes: '', evidenceIds: [] })
    await svc.record({ agentId, versionId, runId: runA, dimension: EvaluationDimension.ALIGNMENT, verdict: EvaluationVerdict.INCONCLUSIVE, evaluatorId, notes: '', evidenceIds: [] })
    const records = await repo.loadByRunId(runA)
    expect(records).toHaveLength(2)
  })

  it('loadByAgentId returns all evaluations for an agent across runs', async () => {
    await svc.record({ agentId, versionId, runId: runA, dimension: EvaluationDimension.QUALITY,     verdict: EvaluationVerdict.PASS, evaluatorId, notes: '', evidenceIds: [] })
    await svc.record({ agentId, versionId, runId: runB, dimension: EvaluationDimension.RELIABILITY, verdict: EvaluationVerdict.FAIL, evaluatorId, notes: '', evidenceIds: [] })
    const records = await repo.loadByAgentId(agentId)
    expect(records).toHaveLength(2)
  })

  it('summarize counts verdicts per dimension', async () => {
    await svc.record({ agentId, versionId, runId: runA, dimension: EvaluationDimension.QUALITY, verdict: EvaluationVerdict.PASS,         evaluatorId, notes: '', evidenceIds: [] })
    await svc.record({ agentId, versionId, runId: runB, dimension: EvaluationDimension.QUALITY, verdict: EvaluationVerdict.PASS,         evaluatorId, notes: '', evidenceIds: [] })
    await svc.record({ agentId, versionId, runId: runC, dimension: EvaluationDimension.QUALITY, verdict: EvaluationVerdict.FAIL,         evaluatorId, notes: '', evidenceIds: [] })
    await svc.record({ agentId, versionId, runId: runA, dimension: EvaluationDimension.SAFETY,  verdict: EvaluationVerdict.INCONCLUSIVE, evaluatorId, notes: '', evidenceIds: [] })
    const records = await repo.loadByAgentId(agentId)
    const summary = svc.summarize(records)
    expect(summary[EvaluationDimension.QUALITY]?.[EvaluationVerdict.PASS]).toBe(2)
    expect(summary[EvaluationDimension.QUALITY]?.[EvaluationVerdict.FAIL]).toBe(1)
    expect(summary[EvaluationDimension.SAFETY]?.[EvaluationVerdict.INCONCLUSIVE]).toBe(1)
  })

  it('EvaluationRecord is JSON-safe', async () => {
    const record = await svc.record({
      agentId, versionId, runId: runA,
      dimension: EvaluationDimension.ALIGNMENT,
      verdict: EvaluationVerdict.PASS,
      evaluatorId, notes: 'ok', evidenceIds: ['ev-001'],
    })
    const json = JSON.stringify(record)
    expect(json).toContain(evaluatorId)
    expect(json).toContain(EvaluationVerdict.PASS)
  })
})

// ── Task 15: ReliabilityService — execution success ≠ reliability ─────────────

describe('agent-evaluation: ReliabilityService', () => {
  let evalRepo: InMemoryEvaluationRepository
  let scoreRepo: InMemoryReliabilityScoreRepository
  let policyRepo: InMemoryPolicyChangeRequestRepository
  let evalSvc: EvaluationService
  let svc: ReliabilityService

  beforeEach(() => {
    evalRepo  = new InMemoryEvaluationRepository()
    scoreRepo = new InMemoryReliabilityScoreRepository()
    policyRepo = new InMemoryPolicyChangeRequestRepository()
    evalSvc   = new EvaluationService(evalRepo)
    svc       = new ReliabilityService(scoreRepo, policyRepo)
  })

  it('computeScore derives score only from EvaluationRecords — not run success flags', async () => {
    // Only evaluation records are the input — no AgentRun, no execution status
    await evalSvc.record({ agentId, versionId, runId: runA, dimension: EvaluationDimension.RELIABILITY, verdict: EvaluationVerdict.PASS, evaluatorId, notes: '', evidenceIds: [] })
    await evalSvc.record({ agentId, versionId, runId: runB, dimension: EvaluationDimension.RELIABILITY, verdict: EvaluationVerdict.PASS, evaluatorId, notes: '', evidenceIds: [] })
    await evalSvc.record({ agentId, versionId, runId: runC, dimension: EvaluationDimension.RELIABILITY, verdict: EvaluationVerdict.FAIL, evaluatorId, notes: '', evidenceIds: [] })
    const records = await evalRepo.loadByAgentId(agentId)
    const score = await svc.computeScore(agentId, versionId, records)
    expect(score.agentId).toBe(agentId)
    expect(score.versionId).toBe(versionId)
    expect(score.evaluationCount).toBe(3)
    expect(score.passRate).toBeCloseTo(2 / 3)
    expect(score.derivedFrom).toBe('evaluation-evidence')
    expect(score.computedAt).toBeDefined()
  })

  it('score with zero evaluations has passRate 0 and evaluationCount 0', async () => {
    const score = await svc.computeScore(agentId, versionId, [])
    expect(score.evaluationCount).toBe(0)
    expect(score.passRate).toBe(0)
  })

  it('computeScore persists score — loadByAgentId returns it', async () => {
    const records = await evalRepo.loadByAgentId(agentId)
    await svc.computeScore(agentId, versionId, records)
    const scores = await scoreRepo.loadByAgentId(agentId)
    expect(scores).toHaveLength(1)
  })

  it('multiple computeScore calls accumulate history', async () => {
    await evalSvc.record({ agentId, versionId, runId: runA, dimension: EvaluationDimension.RELIABILITY, verdict: EvaluationVerdict.PASS, evaluatorId, notes: '', evidenceIds: [] })
    const r1 = await evalRepo.loadByAgentId(agentId)
    await svc.computeScore(agentId, versionId, r1)

    await evalSvc.record({ agentId, versionId, runId: runB, dimension: EvaluationDimension.RELIABILITY, verdict: EvaluationVerdict.FAIL, evaluatorId, notes: '', evidenceIds: [] })
    const r2 = await evalRepo.loadByAgentId(agentId)
    await svc.computeScore(agentId, versionId, r2)

    const scores = await scoreRepo.loadByAgentId(agentId)
    expect(scores).toHaveLength(2)
  })

  it('requestPolicyChange creates a record — does NOT mutate AgentDefinition', async () => {
    const request = await svc.requestPolicyChange({
      agentId,
      versionId,
      rationale:  'alignment score below threshold',
      proposedChange: 'reduce autonomy level to 2',
      requestedBy: 'reliability-monitor',
    })
    expect(request.agentId).toBe(agentId)
    expect(request.status).toBe(PolicyChangeStatus.PENDING)
    expect(request.requestedAt).toBeDefined()
    // The request only records the proposal — no AgentDefinition fields changed
    expect((request as unknown as Record<string, unknown>)['definition']).toBeUndefined()
    expect((request as unknown as Record<string, unknown>)['version']).toBeUndefined()
  })

  it('requestPolicyChange is PENDING — routes through Stage 13, not self-applied', async () => {
    const request = await svc.requestPolicyChange({
      agentId, versionId,
      rationale: 'safety score declined',
      proposedChange: 'add mandatory review step',
      requestedBy: 'safety-officer',
    })
    expect(request.status).toBe(PolicyChangeStatus.PENDING)
    expect(request.status).not.toBe('APPLIED')
    expect(request.status).not.toBe('APPROVED')
  })

  it('loadPending returns only PENDING requests', async () => {
    await svc.requestPolicyChange({ agentId, versionId, rationale: 'r1', proposedChange: 'c1', requestedBy: 'ev' })
    await svc.requestPolicyChange({ agentId, versionId, rationale: 'r2', proposedChange: 'c2', requestedBy: 'ev' })
    const pending = await policyRepo.loadPending(agentId)
    expect(pending).toHaveLength(2)
    expect(pending.every(r => r.status === PolicyChangeStatus.PENDING)).toBe(true)
  })

  it('ReliabilityScore is JSON-safe', async () => {
    const score = await svc.computeScore(agentId, versionId, [])
    const json = JSON.stringify(score)
    expect(json).toContain(agentId)
    expect(json).toContain('evaluation-evidence')
  })

  it('derivedFrom is always "evaluation-evidence" — never "run-success"', async () => {
    // Structural guarantee: derivedFrom is a literal type, not a flag
    const score = await svc.computeScore(agentId, versionId, [])
    expect(score.derivedFrom).toBe('evaluation-evidence')
    expect(score.derivedFrom).not.toBe('run-success')
    expect(score.derivedFrom).not.toBe('execution-status')
  })
})
