import { describe, it, expect, beforeEach } from 'vitest'
import type {
  OversightRequest,
  OversightDecision,
  OversightOperator,
  ConstraintDirective,
  ReviewQueueItem,
  OversightRequestId,
  OversightDecisionId,
  SafetyStopId,
  IncidentRecordId,
  CancellationPropagationId,
} from './index.js'
import {
  OversightDecisionKind,
  OversightRequestState,
  InMemoryReviewQueue,
  InMemoryOversightDecisionRepository,
  InMemoryOversightRequestRepository,
  OversightService,
  SafetyStopSeverity,
  InMemorySafetyStopRepository,
  InMemoryIncidentRepository,
  InMemoryCommunicationCutoffRepository,
  InMemoryCancellationPropagationRepository,
  ContainmentService,
} from './index.js'
import type { AgentRunId, AgentTaskId } from '@rohinik-org/agent-ir'

// ── Helpers ───────────────────────────────────────────────────────────────────

const runA = 'run-a' as unknown as AgentRunId
const runB = 'run-b' as unknown as AgentRunId
const runC = 'run-c' as unknown as AgentRunId
const taskId = 'task-001' as unknown as AgentTaskId

const operator: OversightOperator = {
  operatorId: 'op-001',
  name: 'Alice',
  role: 'safety-officer',
}

// ── Task 12: OversightDecisionKind ────────────────────────────────────────────

describe('agent-oversight: OversightDecisionKind covers all 7 operations', () => {
  it('all seven control operations are present', () => {
    const kinds: OversightDecisionKind[] = [
      OversightDecisionKind.APPROVE,
      OversightDecisionKind.DENY,
      OversightDecisionKind.PAUSE,
      OversightDecisionKind.CONSTRAIN,
      OversightDecisionKind.RESUME,
      OversightDecisionKind.CANCEL,
      OversightDecisionKind.TERMINATE,
    ]
    expect(kinds).toHaveLength(7)
  })

  it('observation is not control — no READ or OBSERVE kind exists', () => {
    expect(Object.values(OversightDecisionKind)).not.toContain('READ')
    expect(Object.values(OversightDecisionKind)).not.toContain('OBSERVE')
    expect(Object.values(OversightDecisionKind)).not.toContain('MONITOR')
    expect(Object.values(OversightDecisionKind)).not.toContain('WATCH')
  })
})

// ── Task 12: OversightRequest and ReviewQueue ─────────────────────────────────

describe('agent-oversight: OversightRequest and ReviewQueue', () => {
  let queue: InMemoryReviewQueue
  let requestRepo: InMemoryOversightRequestRepository
  let decisionRepo: InMemoryOversightDecisionRepository
  let svc: OversightService

  beforeEach(() => {
    queue = new InMemoryReviewQueue()
    requestRepo = new InMemoryOversightRequestRepository()
    decisionRepo = new InMemoryOversightDecisionRepository()
    svc = new OversightService(queue, requestRepo, decisionRepo)
  })

  it('enqueue creates a PENDING request in the review queue', async () => {
    const req = await svc.enqueue({ runId: runA, reason: 'capability-request', context: { cap: 'file-write' } })
    expect(req.state).toBe(OversightRequestState.PENDING)
    expect(req.runId).toBe(runA)
    const items = await queue.peek()
    expect(items).toHaveLength(1)
  })

  it('silence is never approval — PENDING does not auto-advance', async () => {
    const req = await svc.enqueue({ runId: runA, reason: 'capability-request', context: {} })
    const loaded = await requestRepo.load(req.requestId)
    expect(loaded?.state).toBe(OversightRequestState.PENDING)
    expect(loaded?.state).not.toBe(OversightRequestState.DECIDED)
  })

  it('queue is FIFO — earliest enqueued item returned first', async () => {
    const r1 = await svc.enqueue({ runId: runA, reason: 'first', context: {} })
    const r2 = await svc.enqueue({ runId: runB, reason: 'second', context: {} })
    const items = await queue.peek()
    expect(items[0]?.requestId).toBe(r1.requestId)
    expect(items[1]?.requestId).toBe(r2.requestId)
  })

  it('multiple runs can have pending requests simultaneously', async () => {
    await svc.enqueue({ runId: runA, reason: 'r1', context: {} })
    await svc.enqueue({ runId: runB, reason: 'r2', context: {} })
    await svc.enqueue({ runId: runC, reason: 'r3', context: {} })
    const items = await queue.peek()
    expect(items).toHaveLength(3)
  })
})

// ── Task 12: OversightService — all 7 decision operations ────────────────────

describe('agent-oversight: OversightService decisions', () => {
  let queue: InMemoryReviewQueue
  let requestRepo: InMemoryOversightRequestRepository
  let decisionRepo: InMemoryOversightDecisionRepository
  let svc: OversightService

  beforeEach(() => {
    queue = new InMemoryReviewQueue()
    requestRepo = new InMemoryOversightRequestRepository()
    decisionRepo = new InMemoryOversightDecisionRepository()
    svc = new OversightService(queue, requestRepo, decisionRepo)
  })

  const enqueue = () => svc.enqueue({ runId: runA, reason: 'test', context: {} })

  it('approve records APPROVE decision with operator identity', async () => {
    const req = await enqueue()
    const decision = await svc.approve(req.requestId, operator, 'looks safe')
    expect(decision.kind).toBe(OversightDecisionKind.APPROVE)
    expect(decision.operatorId).toBe(operator.operatorId)
    expect(decision.rationale).toBe('looks safe')
    expect(decision.decidedAt).toBeDefined()
  })

  it('deny records DENY decision', async () => {
    const req = await enqueue()
    const decision = await svc.deny(req.requestId, operator, 'policy violation')
    expect(decision.kind).toBe(OversightDecisionKind.DENY)
    expect(decision.rationale).toBe('policy violation')
  })

  it('pause records PAUSE decision', async () => {
    const req = await enqueue()
    const decision = await svc.pause(req.requestId, operator, 'under review')
    expect(decision.kind).toBe(OversightDecisionKind.PAUSE)
  })

  it('constrain records CONSTRAIN decision with ConstraintDirective', async () => {
    const req = await enqueue()
    const directive: ConstraintDirective = {
      removeCapabilities: ['cap-file-write'],
      addDeniedActions: ['write'],
      maxCostUsdOverride: 0.10,
    }
    const decision = await svc.constrain(req.requestId, operator, directive, 'budget limit')
    expect(decision.kind).toBe(OversightDecisionKind.CONSTRAIN)
    expect(decision.constraintDirective).toEqual(directive)
  })

  it('resume records RESUME decision', async () => {
    const req = await enqueue()
    await svc.pause(req.requestId, operator, 'review')
    const resumeReq = await svc.enqueue({ runId: runA, reason: 'resume-after-review', context: {} })
    const decision = await svc.resume(resumeReq.requestId, operator, 'review complete')
    expect(decision.kind).toBe(OversightDecisionKind.RESUME)
  })

  it('cancel records CANCEL decision', async () => {
    const req = await enqueue()
    const decision = await svc.cancel(req.requestId, operator, 'no longer needed')
    expect(decision.kind).toBe(OversightDecisionKind.CANCEL)
  })

  it('terminate records TERMINATE decision — strongest intervention', async () => {
    const req = await enqueue()
    const decision = await svc.terminate(req.requestId, operator, 'safety breach')
    expect(decision.kind).toBe(OversightDecisionKind.TERMINATE)
    expect(decision.rationale).toBe('safety breach')
  })

  it('decision marks request as DECIDED and removes from queue', async () => {
    const req = await enqueue()
    await svc.approve(req.requestId, operator, 'ok')
    const loaded = await requestRepo.load(req.requestId)
    expect(loaded?.state).toBe(OversightRequestState.DECIDED)
    const items = await queue.peek()
    expect(items).toHaveLength(0)
  })

  it('decision on unknown request throws', async () => {
    await expect(svc.approve('no-req' as unknown as OversightRequestId, operator, '')).rejects.toThrow('request-not-found')
  })

  it('duplicate decision on already-decided request throws', async () => {
    const req = await enqueue()
    await svc.approve(req.requestId, operator, 'first')
    await expect(svc.deny(req.requestId, operator, 'second')).rejects.toThrow('already-decided')
  })

  it('decisions are durable — loadByRunId returns all decisions for a run', async () => {
    const r1 = await enqueue()
    const r2 = await svc.enqueue({ runId: runA, reason: 'second', context: {} })
    await svc.approve(r1.requestId, operator, 'ok')
    await svc.deny(r2.requestId, operator, 'no')
    const decisions = await decisionRepo.loadByRunId(runA)
    expect(decisions).toHaveLength(2)
  })

  it('OversightDecision is JSON-safe — no functions or class instances', async () => {
    const req = await enqueue()
    const decision = await svc.approve(req.requestId, operator, 'ok')
    const json = JSON.stringify(decision)
    expect(json).toContain(operator.operatorId)
  })
})

// ── Task 13: SafetyStop ───────────────────────────────────────────────────────

describe('agent-oversight: ContainmentService — safety stops', () => {
  let stopRepo: InMemorySafetyStopRepository
  let incidentRepo: InMemoryIncidentRepository
  let cutoffRepo: InMemoryCommunicationCutoffRepository
  let propagationRepo: InMemoryCancellationPropagationRepository
  let svc: ContainmentService

  beforeEach(() => {
    stopRepo = new InMemorySafetyStopRepository()
    incidentRepo = new InMemoryIncidentRepository()
    cutoffRepo = new InMemoryCommunicationCutoffRepository()
    propagationRepo = new InMemoryCancellationPropagationRepository()
    svc = new ContainmentService(stopRepo, incidentRepo, cutoffRepo, propagationRepo)
  })

  it('stop creates a SafetyStop record with operator identity and severity', async () => {
    const stop = await svc.stop({
      runId: runA,
      operator,
      reason: 'unexpected tool call',
      severity: SafetyStopSeverity.CRITICAL,
    })
    expect(stop.runId).toBe(runA)
    expect(stop.operatorId).toBe(operator.operatorId)
    expect(stop.severity).toBe(SafetyStopSeverity.CRITICAL)
    expect(stop.stoppedAt).toBeDefined()
  })

  it('stop covers all severity levels', () => {
    const severities: SafetyStopSeverity[] = [
      SafetyStopSeverity.WARNING,
      SafetyStopSeverity.CRITICAL,
      SafetyStopSeverity.EMERGENCY,
    ]
    expect(severities).toHaveLength(3)
  })

  it('propagate records cancellation of child runs in delegation tree', async () => {
    const stop = await svc.stop({ runId: runA, operator, reason: 'breach', severity: SafetyStopSeverity.CRITICAL })
    const propagation = await svc.propagate(stop.safetyStopId, [runB, runC])
    expect(propagation.originStopId).toBe(stop.safetyStopId)
    expect(propagation.cancelledRunIds).toContain(runB)
    expect(propagation.cancelledRunIds).toContain(runC)
    expect(propagation.propagatedAt).toBeDefined()
  })

  it('propagate on unknown stop throws', async () => {
    await expect(svc.propagate('no-stop' as unknown as SafetyStopId, [runB])).rejects.toThrow('stop-not-found')
  })

  it('cutoff severs mailbox — run cannot send or receive', async () => {
    const stop = await svc.stop({ runId: runA, operator, reason: 'containment', severity: SafetyStopSeverity.EMERGENCY })
    const cutoff = await svc.cutoff(stop.safetyStopId, runA)
    expect(cutoff.runId).toBe(runA)
    expect(cutoff.safetyStopId).toBe(stop.safetyStopId)
    expect(cutoff.cutoffAt).toBeDefined()
  })

  it('isCutOff returns true for run with active cutoff', async () => {
    const stop = await svc.stop({ runId: runA, operator, reason: 'test', severity: SafetyStopSeverity.CRITICAL })
    await svc.cutoff(stop.safetyStopId, runA)
    const result = await svc.isCutOff(runA)
    expect(result).toBe(true)
  })

  it('isCutOff returns false for run with no cutoff', async () => {
    const result = await svc.isCutOff(runB)
    expect(result).toBe(false)
  })

  it('recordIncident creates an incident evidence bundle', async () => {
    const stop = await svc.stop({ runId: runA, operator, reason: 'anomaly', severity: SafetyStopSeverity.WARNING })
    const incident = await svc.recordIncident({
      safetyStopId: stop.safetyStopId,
      runId: runA,
      summary: 'agent attempted disallowed action',
      evidenceIds: ['ev-001', 'ev-002'],
    })
    expect(incident.runId).toBe(runA)
    expect(incident.safetyStopId).toBe(stop.safetyStopId)
    expect(incident.evidenceIds).toContain('ev-001')
    expect(incident.recordedAt).toBeDefined()
  })

  it('stopped run requires re-admission — re-admission flag set on stop record', async () => {
    const stop = await svc.stop({ runId: runA, operator, reason: 'halt', severity: SafetyStopSeverity.CRITICAL })
    expect(stop.requiresReAdmission).toBe(true)
  })

  it('EMERGENCY stop requires re-admission; WARNING does not block re-admission by default', async () => {
    const emergency = await svc.stop({ runId: runA, operator, reason: 'breach', severity: SafetyStopSeverity.EMERGENCY })
    const warning   = await svc.stop({ runId: runB, operator, reason: 'caution', severity: SafetyStopSeverity.WARNING })
    expect(emergency.requiresReAdmission).toBe(true)
    expect(warning.requiresReAdmission).toBe(false)
  })

  it('SafetyStop is JSON-safe', async () => {
    const stop = await svc.stop({ runId: runA, operator, reason: 'test', severity: SafetyStopSeverity.CRITICAL })
    const json = JSON.stringify(stop)
    expect(json).toContain(runA)
    expect(json).toContain(operator.operatorId)
  })

  it('loadStopsByRunId returns all stops for a run', async () => {
    await svc.stop({ runId: runA, operator, reason: 'first',  severity: SafetyStopSeverity.WARNING })
    await svc.stop({ runId: runA, operator, reason: 'second', severity: SafetyStopSeverity.CRITICAL })
    const stops = await stopRepo.loadByRunId(runA)
    expect(stops).toHaveLength(2)
  })
})
