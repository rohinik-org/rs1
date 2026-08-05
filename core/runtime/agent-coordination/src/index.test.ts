import { describe, it, expect, beforeEach } from 'vitest'
import type {
  CoordinationMessage,
  CoordinationMailbox,
  CoordinationTeam,
  CoordinationPlan,
  WorkClaim,
  TeamChangeRecord,
  AgentPlacementBinding,
  PlacementPort,
  MailboxId,
  CoordinationMessageId,
  CoordinationPlanId,
  CoordinationTeamId,
  WorkClaimId,
  PlacementBindingId,
  AttemptId,
} from './index.js'
import {
  InMemoryMailboxRepository,
  InMemoryCoordinationTeamRepository,
  InMemoryCoordinationPlanRepository,
  InMemoryWorkClaimRepository,
  InMemoryPlacementBindingRepository,
  CoordinationMessagingService,
  CoordinationTeamService,
  CoordinationPlanService,
  AgentPlacementService,
  buildMessageHash,
  resolveConflict,
  detectDeadlock,
} from './index.js'
import type {
  AgentRunId,
  AgentTaskId,
  AgentTeamId,
} from '@rohinik-org/agent-ir'
import type { DelegatedTaskId } from '@rohinik-org/agent-delegation'

// ── Helpers ───────────────────────────────────────────────────────────────────

const runA = 'run-a' as unknown as AgentRunId
const runB = 'run-b' as unknown as AgentRunId
const runC = 'run-c' as unknown as AgentRunId
const taskId = 'task-001' as unknown as AgentTaskId

// ── Task 9: Messaging ─────────────────────────────────────────────────────────

describe('agent-coordination: CoordinationMessage structure', () => {
  it('buildMessageHash produces stable SHA-256 over message body', () => {
    const h1 = buildMessageHash({ fromRunId: runA, toMailboxId: 'mb-001' as unknown as MailboxId, content: { x: 1 }, sentAt: new Date('2026-01-01T00:00:00Z') })
    const h2 = buildMessageHash({ fromRunId: runA, toMailboxId: 'mb-001' as unknown as MailboxId, content: { x: 1 }, sentAt: new Date('2026-01-01T00:00:00Z') })
    expect(h1).toBe(h2)
    expect(typeof h1).toBe('string')
    expect(h1.length).toBe(64)  // hex SHA-256
  })

  it('buildMessageHash differs for different content', () => {
    const sentAt = new Date('2026-01-01T00:00:00Z')
    const h1 = buildMessageHash({ fromRunId: runA, toMailboxId: 'mb-001' as unknown as MailboxId, content: { x: 1 }, sentAt })
    const h2 = buildMessageHash({ fromRunId: runA, toMailboxId: 'mb-001' as unknown as MailboxId, content: { x: 2 }, sentAt })
    expect(h1).not.toBe(h2)
  })

  it('message structure includes correlationId, causationId, expiry, dedup hash', () => {
    const msg: CoordinationMessage = {
      messageId: 'msg-001' as unknown as CoordinationMessageId,
      fromRunId: runA,
      toMailboxId: 'mb-001' as unknown as MailboxId,
      content: { request: 'ping' },
      correlationId: 'corr-001',
      causationId: 'msg-000',
      contentHash: 'abc123',
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      redacted: false,
    }
    expect(msg.correlationId).toBeDefined()
    expect(msg.causationId).toBeDefined()
    expect(msg.contentHash).toBeDefined()
    expect(msg.expiresAt).toBeDefined()
    expect(msg.redacted).toBe(false)
  })
})

describe('agent-coordination: CoordinationMessagingService', () => {
  let mailboxRepo: InMemoryMailboxRepository
  let svc: CoordinationMessagingService

  beforeEach(() => {
    mailboxRepo = new InMemoryMailboxRepository()
    svc = new CoordinationMessagingService(mailboxRepo)
  })

  it('createMailbox assigns a mailboxId to a run', async () => {
    const mailbox = await svc.createMailbox(runA)
    expect(mailbox.mailboxId).toBeDefined()
    expect(mailbox.ownerRunId).toBe(runA)
    expect(mailbox.messages).toHaveLength(0)
  })

  it('send delivers message to target mailbox', async () => {
    const mb = await svc.createMailbox(runB)
    const msg = await svc.send({
      fromRunId: runA,
      toMailboxId: mb.mailboxId,
      content: { hello: 'world' },
      correlationId: 'corr-001',
    })
    expect(msg.messageId).toBeDefined()
    expect(msg.contentHash).toBeDefined()
    expect(msg.fromRunId).toBe(runA)

    const loaded = await mailboxRepo.load(mb.mailboxId)
    expect(loaded?.messages).toHaveLength(1)
  })

  it('send fails to unknown mailbox', async () => {
    await expect(svc.send({
      fromRunId: runA,
      toMailboxId: 'no-mb' as unknown as MailboxId,
      content: {},
    })).rejects.toThrow('mailbox-not-found')
  })

  it('deduplication: same contentHash delivered only once', async () => {
    const mb = await svc.createMailbox(runB)
    await svc.send({ fromRunId: runA, toMailboxId: mb.mailboxId, content: { x: 1 } })
    // Send identical message again (same fromRunId + content + no random seed)
    await svc.send({ fromRunId: runA, toMailboxId: mb.mailboxId, content: { x: 1 } })
    const loaded = await mailboxRepo.load(mb.mailboxId)
    expect(loaded?.messages).toHaveLength(1)  // deduped
  })

  it('acknowledge removes message from mailbox', async () => {
    const mb = await svc.createMailbox(runB)
    const msg = await svc.send({ fromRunId: runA, toMailboxId: mb.mailboxId, content: { x: 1 } })
    await svc.acknowledge(mb.mailboxId, msg.messageId)
    const loaded = await mailboxRepo.load(mb.mailboxId)
    expect(loaded?.messages).toHaveLength(0)
  })

  it('expired messages are filtered out on read', async () => {
    const mb = await svc.createMailbox(runB)
    await svc.send({
      fromRunId: runA,
      toMailboxId: mb.mailboxId,
      content: { x: 1 },
      expiresAt: new Date(Date.now() - 1000),  // already expired
    })
    const messages = await svc.readMessages(mb.mailboxId)
    expect(messages).toHaveLength(0)
  })

  it('non-expired messages are returned on read', async () => {
    const mb = await svc.createMailbox(runB)
    await svc.send({
      fromRunId: runA,
      toMailboxId: mb.mailboxId,
      content: { x: 1 },
      expiresAt: new Date(Date.now() + 60000),
    })
    const messages = await svc.readMessages(mb.mailboxId)
    expect(messages).toHaveLength(1)
  })

  it('redacted message hides content but preserves metadata', async () => {
    const mb = await svc.createMailbox(runB)
    const msg = await svc.send({ fromRunId: runA, toMailboxId: mb.mailboxId, content: { secret: 'data' } })
    await svc.redact(mb.mailboxId, msg.messageId)
    const loaded = await mailboxRepo.load(mb.mailboxId)
    const redacted = loaded?.messages[0]
    expect(redacted?.redacted).toBe(true)
    expect(redacted?.content).toBeNull()
    expect(redacted?.messageId).toBe(msg.messageId)
    expect(redacted?.contentHash).toBe(msg.contentHash)  // hash preserved for audit
  })

  it('policy check port blocks send when policy denies', async () => {
    const denyPolicy = { check: async () => ({ allowed: false, reason: 'policy-denied' }) }
    const strictSvc = new CoordinationMessagingService(mailboxRepo, denyPolicy)
    const mb = await strictSvc.createMailbox(runB)
    await expect(strictSvc.send({ fromRunId: runA, toMailboxId: mb.mailboxId, content: {} })).rejects.toThrow('policy-denied')
  })
})

// ── Task 10: Teams ────────────────────────────────────────────────────────────

describe('agent-coordination: CoordinationTeam', () => {
  let teamRepo: InMemoryCoordinationTeamRepository
  let svc: CoordinationTeamService

  beforeEach(() => {
    teamRepo = new InMemoryCoordinationTeamRepository()
    svc = new CoordinationTeamService(teamRepo)
  })

  it('createTeam sets leader and initial members', async () => {
    const team = await svc.createTeam({ leaderId: runA, memberIds: [runA, runB], name: 'team-alpha' })
    expect(team.leaderId).toBe(runA)
    expect(team.members).toContain(runA)
    expect(team.members).toContain(runB)
    expect(team.version).toBe(1)
  })

  it('addMember increments team version', async () => {
    const team = await svc.createTeam({ leaderId: runA, memberIds: [runA], name: 'team-beta' })
    const updated = await svc.addMember(team.coordinationTeamId, runB)
    expect(updated.members).toContain(runB)
    expect(updated.version).toBe(2)
  })

  it('removeMember decrements membership and increments version', async () => {
    const team = await svc.createTeam({ leaderId: runA, memberIds: [runA, runB], name: 'team-gamma' })
    const updated = await svc.removeMember(team.coordinationTeamId, runB)
    expect(updated.members).not.toContain(runB)
    expect(updated.version).toBe(2)
  })

  it('team change is recorded with version and reason', async () => {
    const team = await svc.createTeam({ leaderId: runA, memberIds: [runA], name: 'team-delta' })
    await svc.addMember(team.coordinationTeamId, runB)
    const changes = await teamRepo.listChanges(team.coordinationTeamId)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.toVersion).toBe(2)
  })

  it('leader cannot be removed from team', async () => {
    const team = await svc.createTeam({ leaderId: runA, memberIds: [runA, runB], name: 'team-epsilon' })
    await expect(svc.removeMember(team.coordinationTeamId, runA)).rejects.toThrow('cannot-remove-leader')
  })
})

describe('agent-coordination: CoordinationPlan and work claims', () => {
  let planRepo: InMemoryCoordinationPlanRepository
  let claimRepo: InMemoryWorkClaimRepository
  let planSvc: CoordinationPlanService

  beforeEach(() => {
    planRepo = new InMemoryCoordinationPlanRepository()
    claimRepo = new InMemoryWorkClaimRepository()
    planSvc = new CoordinationPlanService(planRepo, claimRepo)
  })

  it('createPlan captures shared task graph with barriers', async () => {
    const plan = await planSvc.createPlan({
      teamId: 'team-001' as unknown as CoordinationTeamId,
      taskIds: [taskId],
      barriers: [{ barrierId: 'b-001', requiredTaskIds: [taskId] }],
    })
    expect(plan.taskIds).toContain(taskId)
    expect(plan.barriers).toHaveLength(1)
    expect(plan.version).toBe(1)
  })

  it('claimWork records a work claim for a run on a task', async () => {
    const plan = await planSvc.createPlan({ teamId: 'team-001' as unknown as CoordinationTeamId, taskIds: [taskId], barriers: [] })
    const claim = await planSvc.claimWork(plan.coordinationPlanId, taskId, runA)
    expect(claim.claimedBy).toBe(runA)
    expect(claim.taskId).toBe(taskId)
  })

  it('claimWork rejected when task already claimed by another run', async () => {
    const plan = await planSvc.createPlan({ teamId: 'team-001' as unknown as CoordinationTeamId, taskIds: [taskId], barriers: [] })
    await planSvc.claimWork(plan.coordinationPlanId, taskId, runA)
    await expect(planSvc.claimWork(plan.coordinationPlanId, taskId, runB)).rejects.toThrow('task-already-claimed')
  })

  it('barrier is not cleared until all required tasks are claimed', async () => {
    const taskA = 'task-a' as unknown as AgentTaskId
    const taskB = 'task-b' as unknown as AgentTaskId
    const plan = await planSvc.createPlan({
      teamId: 'team-001' as unknown as CoordinationTeamId,
      taskIds: [taskA, taskB],
      barriers: [{ barrierId: 'b-001', requiredTaskIds: [taskA, taskB] }],
    })
    await planSvc.claimWork(plan.coordinationPlanId, taskA, runA)
    const cleared = await planSvc.isBarrierCleared(plan.coordinationPlanId, 'b-001')
    expect(cleared).toBe(false)
    await planSvc.claimWork(plan.coordinationPlanId, taskB, runB)
    const clearedNow = await planSvc.isBarrierCleared(plan.coordinationPlanId, 'b-001')
    expect(clearedNow).toBe(true)
  })
})

describe('agent-coordination: conflict resolution and deadlock detection', () => {
  it('resolveConflict is deterministic — same claims produce same winner', () => {
    const claims: WorkClaim[] = [
      { workClaimId: 'wc-1' as unknown as WorkClaimId, planId: 'plan-001' as unknown as CoordinationPlanId, taskId, claimedBy: runA, claimedAt: new Date('2026-01-01T00:00:00Z') },
      { workClaimId: 'wc-2' as unknown as WorkClaimId, planId: 'plan-001' as unknown as CoordinationPlanId, taskId, claimedBy: runB, claimedAt: new Date('2026-01-01T00:00:01Z') },
    ]
    const winner1 = resolveConflict(claims)
    const winner2 = resolveConflict(claims)
    expect(winner1).toBe(winner2)
  })

  it('resolveConflict picks earliest claimedAt — ties broken by runId lexical order', () => {
    const earlier = new Date('2026-01-01T00:00:00Z')
    const later   = new Date('2026-01-01T00:00:01Z')
    const claims: WorkClaim[] = [
      { workClaimId: 'wc-1' as unknown as WorkClaimId, planId: 'plan-001' as unknown as CoordinationPlanId, taskId, claimedBy: runB, claimedAt: later },
      { workClaimId: 'wc-2' as unknown as WorkClaimId, planId: 'plan-001' as unknown as CoordinationPlanId, taskId, claimedBy: runA, claimedAt: earlier },
    ]
    expect(resolveConflict(claims)).toBe(runA)  // runA claimed earlier
  })

  it('resolveConflict breaks ties by runId lexical order', () => {
    const at = new Date('2026-01-01T00:00:00Z')
    const claims: WorkClaim[] = [
      { workClaimId: 'wc-1' as unknown as WorkClaimId, planId: 'plan-001' as unknown as CoordinationPlanId, taskId, claimedBy: 'run-z' as unknown as AgentRunId, claimedAt: at },
      { workClaimId: 'wc-2' as unknown as WorkClaimId, planId: 'plan-001' as unknown as CoordinationPlanId, taskId, claimedBy: 'run-a' as unknown as AgentRunId, claimedAt: at },
    ]
    expect(resolveConflict(claims)).toBe('run-a')  // lexically first
  })

  it('detectDeadlock finds cycle in wait-for graph', () => {
    // A waits for B, B waits for A — cycle
    const waitFor = new Map<AgentRunId, AgentRunId>([
      [runA, runB],
      [runB, runA],
    ])
    const cycle = detectDeadlock(waitFor)
    expect(cycle).not.toBeNull()
    expect(cycle).toContain(runA)
    expect(cycle).toContain(runB)
  })

  it('detectDeadlock returns null when no cycle', () => {
    // A waits for B, B waits for C — no cycle
    const waitFor = new Map<AgentRunId, AgentRunId>([
      [runA, runB],
      [runB, runC],
    ])
    const cycle = detectDeadlock(waitFor)
    expect(cycle).toBeNull()
  })
})

// ── Task 11: Placement binding ────────────────────────────────────────────────

describe('agent-coordination: AgentPlacementBinding', () => {
  let bindingRepo: InMemoryPlacementBindingRepository
  let svc: AgentPlacementService

  beforeEach(() => {
    bindingRepo = new InMemoryPlacementBindingRepository()
    svc = new AgentPlacementService(bindingRepo)
  })

  it('bind links AgentRunId to placementId, nodeId, federationId', async () => {
    const binding = await svc.bind({
      runId: runA,
      placementId: 'placement-001',
      nodeId: 'node-001',
      federationId: 'fed-001',
    })
    expect(binding.runId).toBe(runA)
    expect(binding.placementId).toBe('placement-001')
    expect(binding.nodeId).toBe('node-001')
    expect(binding.federationId).toBe('fed-001')
    expect(binding.attemptId).toBeDefined()
  })

  it('bind for DelegatedTask links delegatedTaskId alongside runId', async () => {
    const dtId = 'dtask-001' as unknown as DelegatedTaskId
    const binding = await svc.bind({
      runId: runA,
      delegatedTaskId: dtId,
      placementId: 'placement-002',
      nodeId: 'node-002',
      federationId: 'fed-001',
    })
    expect(binding.delegatedTaskId).toBe(dtId)
  })

  it('failover preserves identity and creates new attemptId', async () => {
    const binding = await svc.bind({
      runId: runA,
      placementId: 'placement-003',
      nodeId: 'node-003',
      federationId: 'fed-001',
    })
    const failedOver = await svc.failover(binding.placementBindingId, 'node-004', 'node-failover')
    expect(failedOver.runId).toBe(runA)                      // identity preserved
    expect(failedOver.federationId).toBe('fed-001')          // federation preserved
    expect(failedOver.nodeId).toBe('node-004')               // new node
    expect(failedOver.attemptId).not.toBe(binding.attemptId) // new attempt
    expect(failedOver.failoverReason).toBe('node-failover')
    expect(failedOver.previousAttemptId).toBe(binding.attemptId)
  })

  it('failover on unknown binding fails', async () => {
    await expect(svc.failover('no-binding' as unknown as PlacementBindingId, 'node-x', 'reason')).rejects.toThrow('binding-not-found')
  })

  it('load binding by runId', async () => {
    await svc.bind({ runId: runA, placementId: 'p-001', nodeId: 'n-001', federationId: 'f-001' })
    const found = await bindingRepo.loadByRunId(runA)
    expect(found).toHaveLength(1)
    expect(found[0]?.runId).toBe(runA)
  })

  it('PlacementPort is injectable — no Stage 14 SDK import required', () => {
    // Structural: the port interface accepts plain string IDs that are compatible
    // with Stage 14 PlacementId/NodeId/FederationId without importing that package.
    const port: PlacementPort = {
      getPlacement: async (runId) => ({
        placementId: 'p-001',
        nodeId: 'n-001',
        federationId: 'f-001',
      }),
    }
    expect(typeof port.getPlacement).toBe('function')
  })

  it('checkpoint policy is preserved across failover', async () => {
    const binding = await svc.bind({
      runId: runA,
      placementId: 'p-cp1',
      nodeId: 'n-cp1',
      federationId: 'f-001',
      checkpointPolicy: 'every-5-steps',
    })
    const failedOver = await svc.failover(binding.placementBindingId, 'n-cp2', 'hardware-fault')
    expect(failedOver.checkpointPolicy).toBe('every-5-steps')
  })
})
