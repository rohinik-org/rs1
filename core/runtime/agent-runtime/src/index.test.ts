import { describe, it, expect, beforeEach } from 'vitest'
import type {
  AgentAdmissionRequest,
  AgentAdmissionResult,
  AgentInstanceRepository,
  AgentVersionRepository,
  AgentRunRepository,
  AgentPlanRepository,
  AgentCheckpointRepository,
  AgentRunHistoryRepository,
  PolicyPort,
  CapabilityPort,
  BudgetPort,
} from './index.js'
import {
  AgentAdmissionService,
  AgentRunLifecycleService,
  InMemoryAgentInstanceRepository,
  InMemoryAgentVersionRepository,
  InMemoryAgentRunRepository,
  InMemoryAgentPlanRepository,
  InMemoryAgentCheckpointRepository,
  InMemoryAgentRunHistoryRepository,
} from './index.js'
import type {
  AgentInstance,
  AgentVersion,
  AgentRun,
  AgentInstanceId,
  AgentDefinitionId,
  AgentVersionId,
  AgentRunId,
  AgentTaskId,
} from '@rohinik-org/agent-ir'
import { AgentRunState, AgentPlanState } from '@rohinik-org/agent-ir'

const makeInstance = (id: string): AgentInstance => ({
  instanceId: id as unknown as AgentInstanceId,
  definitionId: 'def-001' as unknown as AgentDefinitionId,
  versionId: 'ver-001' as unknown as AgentVersionId,
  createdAt: new Date(),
})

const makeVersion = (): AgentVersion => ({
  versionId: 'ver-001' as unknown as AgentVersionId,
  definitionId: 'def-001' as unknown as AgentDefinitionId,
  semver: '1.0.0',
  goals: [],
  roles: [],
  authority: {
    authorityId: 'auth-001',
    allowedCapabilities: ['cap-read'],
    allowedActions: ['read'],
    deniedActions: [],
    maxDelegationDepth: 1,
  },
  capabilityRequirements: [{ capabilityId: 'cap-read', required: true }],
  budget: { budgetId: 'bgt-001', maxCostUsd: 1.0, maxLatencyMs: 5000, maxTokens: 4096 },
  constraints: [],
  policyRefs: [],
  publishedAt: new Date(),
})

const passingPolicyPort: PolicyPort = {
  evaluate: async () => ({ allowed: true }),
}
const failingPolicyPort: PolicyPort = {
  evaluate: async () => ({ allowed: false, reason: 'policy-denied' }),
}
const passingCapabilityPort: CapabilityPort = {
  checkAvailable: async () => ({ available: true }),
}
const failingCapabilityPort: CapabilityPort = {
  checkAvailable: async () => ({ available: false, missing: ['cap-read'] }),
}
const passingBudgetPort: BudgetPort = {
  checkBudget: async () => ({ sufficient: true }),
}
const failingBudgetPort: BudgetPort = {
  checkBudget: async () => ({ sufficient: false, reason: 'cost-exceeded' }),
}

describe('agent-runtime admission', () => {
  let instanceRepo: InMemoryAgentInstanceRepository
  let versionRepo: InMemoryAgentVersionRepository
  let runRepo: InMemoryAgentRunRepository

  beforeEach(() => {
    instanceRepo = new InMemoryAgentInstanceRepository()
    versionRepo = new InMemoryAgentVersionRepository()
    runRepo = new InMemoryAgentRunRepository()
  })

  it('admits instance when all ports pass', async () => {
    const inst = makeInstance('inst-001')
    const ver = makeVersion()
    await instanceRepo.save(inst)
    await versionRepo.save(ver)

    const svc = new AgentAdmissionService(
      instanceRepo, versionRepo, runRepo,
      passingPolicyPort, passingCapabilityPort, passingBudgetPort,
    )
    const req: AgentAdmissionRequest = { instanceId: inst.instanceId, requestedAt: new Date() }
    const result = await svc.admit(req)

    expect(result.admitted).toBe(true)
    expect(result.runId).toBeDefined()
  })

  it('rejects when policy denies', async () => {
    const inst = makeInstance('inst-002')
    const ver = makeVersion()
    await instanceRepo.save(inst)
    await versionRepo.save(ver)

    const svc = new AgentAdmissionService(
      instanceRepo, versionRepo, runRepo,
      failingPolicyPort, passingCapabilityPort, passingBudgetPort,
    )
    const req: AgentAdmissionRequest = { instanceId: inst.instanceId, requestedAt: new Date() }
    const result = await svc.admit(req)

    expect(result.admitted).toBe(false)
    expect(result.reason).toBe('policy-denied')
  })

  it('rejects when required capability is missing', async () => {
    const inst = makeInstance('inst-003')
    const ver = makeVersion()
    await instanceRepo.save(inst)
    await versionRepo.save(ver)

    const svc = new AgentAdmissionService(
      instanceRepo, versionRepo, runRepo,
      passingPolicyPort, failingCapabilityPort, passingBudgetPort,
    )
    const req: AgentAdmissionRequest = { instanceId: inst.instanceId, requestedAt: new Date() }
    const result = await svc.admit(req)

    expect(result.admitted).toBe(false)
    expect(result.reason).toContain('capability')
  })

  it('rejects when budget is insufficient', async () => {
    const inst = makeInstance('inst-004')
    const ver = makeVersion()
    await instanceRepo.save(inst)
    await versionRepo.save(ver)

    const svc = new AgentAdmissionService(
      instanceRepo, versionRepo, runRepo,
      passingPolicyPort, passingCapabilityPort, failingBudgetPort,
    )
    const req: AgentAdmissionRequest = { instanceId: inst.instanceId, requestedAt: new Date() }
    const result = await svc.admit(req)

    expect(result.admitted).toBe(false)
    expect(result.reason).toContain('budget')
  })

  it('rejects unknown instance (fail-closed)', async () => {
    const svc = new AgentAdmissionService(
      instanceRepo, versionRepo, runRepo,
      passingPolicyPort, passingCapabilityPort, passingBudgetPort,
    )
    const req: AgentAdmissionRequest = {
      instanceId: 'inst-unknown' as unknown as AgentInstanceId,
      requestedAt: new Date(),
    }
    const result = await svc.admit(req)

    expect(result.admitted).toBe(false)
    expect(result.reason).toContain('instance')
  })

  it('admitted run is in ADMITTED state, not RUNNING', async () => {
    const inst = makeInstance('inst-005')
    const ver = makeVersion()
    await instanceRepo.save(inst)
    await versionRepo.save(ver)

    const svc = new AgentAdmissionService(
      instanceRepo, versionRepo, runRepo,
      passingPolicyPort, passingCapabilityPort, passingBudgetPort,
    )
    const req: AgentAdmissionRequest = { instanceId: inst.instanceId, requestedAt: new Date() }
    const result = await svc.admit(req)

    expect(result.admitted).toBe(true)
    const run = await runRepo.load(result.runId!)
    expect(run?.state).toBe(AgentRunState.ADMITTED)
    expect(run?.state).not.toBe(AgentRunState.RUNNING)
  })

  it('version is bound exactly at admission time', async () => {
    const inst = makeInstance('inst-006')
    const ver = makeVersion()
    await instanceRepo.save(inst)
    await versionRepo.save(ver)

    const svc = new AgentAdmissionService(
      instanceRepo, versionRepo, runRepo,
      passingPolicyPort, passingCapabilityPort, passingBudgetPort,
    )
    const req: AgentAdmissionRequest = { instanceId: inst.instanceId, requestedAt: new Date() }
    const result = await svc.admit(req)

    const run = await runRepo.load(result.runId!)
    expect(run?.versionId).toBe(ver.versionId)
  })
})

describe('agent-runtime repositories', () => {
  it('InMemoryAgentInstanceRepository save and load', async () => {
    const repo = new InMemoryAgentInstanceRepository()
    const inst = makeInstance('inst-r1')
    await repo.save(inst)
    const loaded = await repo.load(inst.instanceId)
    expect(loaded?.instanceId).toBe(inst.instanceId)
  })

  it('InMemoryAgentInstanceRepository returns undefined for unknown id', async () => {
    const repo = new InMemoryAgentInstanceRepository()
    const loaded = await repo.load('nope' as unknown as AgentInstanceId)
    expect(loaded).toBeUndefined()
  })

  it('InMemoryAgentVersionRepository save and load', async () => {
    const repo = new InMemoryAgentVersionRepository()
    const ver = makeVersion()
    await repo.save(ver)
    const loaded = await repo.load(ver.versionId)
    expect(loaded?.semver).toBe('1.0.0')
  })

  it('InMemoryAgentRunRepository save, load, loadByInstanceId', async () => {
    const repo = new InMemoryAgentRunRepository()
    const run: AgentRun = {
      runId: 'run-r1' as unknown as AgentRunId,
      instanceId: 'inst-r1' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.ADMITTED,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await repo.save(run)
    const byId = await repo.load(run.runId)
    const byInst = await repo.loadByInstanceId(run.instanceId)
    expect(byId?.state).toBe(AgentRunState.ADMITTED)
    expect(byInst).toHaveLength(1)
  })
})

// ── Task 5: Run lifecycle, planning, checkpointing, recovery ─────────────────

describe('agent-runtime run lifecycle transitions', () => {
  let runRepo: InMemoryAgentRunRepository
  let planRepo: InMemoryAgentPlanRepository
  let checkpointRepo: InMemoryAgentCheckpointRepository
  let historyRepo: InMemoryAgentRunHistoryRepository
  let svc: AgentRunLifecycleService

  beforeEach(() => {
    runRepo = new InMemoryAgentRunRepository()
    planRepo = new InMemoryAgentPlanRepository()
    checkpointRepo = new InMemoryAgentCheckpointRepository()
    historyRepo = new InMemoryAgentRunHistoryRepository()
    svc = new AgentRunLifecycleService(runRepo, planRepo, checkpointRepo, historyRepo)
  })

  const makeAdmittedRun = (): AgentRun => ({
    runId: 'run-lc1' as unknown as AgentRunId,
    instanceId: 'inst-001' as unknown as AgentInstanceId,
    definitionId: 'def-001' as unknown as AgentDefinitionId,
    versionId: 'ver-001' as unknown as AgentVersionId,
    state: AgentRunState.ADMITTED,
    startedAt: new Date(),
    admittedAt: new Date(),
  })

  it('ADMITTED → READY is valid', async () => {
    const run = makeAdmittedRun()
    await runRepo.save(run)
    const result = await svc.transition(run.runId, AgentRunState.READY, { evidenceId: 'ev-001', reason: 'ready' })
    expect(result.ok).toBe(true)
    const updated = await runRepo.load(run.runId)
    expect(updated?.state).toBe(AgentRunState.READY)
  })

  it('READY → RUNNING is valid', async () => {
    const run = { ...makeAdmittedRun(), state: AgentRunState.READY } as AgentRun
    await runRepo.save(run)
    const result = await svc.transition(run.runId, AgentRunState.RUNNING, { evidenceId: 'ev-002', reason: 'started' })
    expect(result.ok).toBe(true)
    const updated = await runRepo.load(run.runId)
    expect(updated?.state).toBe(AgentRunState.RUNNING)
  })

  it('RUNNING → DELEGATING is valid', async () => {
    const run = { ...makeAdmittedRun(), state: AgentRunState.RUNNING } as AgentRun
    await runRepo.save(run)
    const result = await svc.transition(run.runId, AgentRunState.DELEGATING, { evidenceId: 'ev-003', reason: 'delegated-task-active' })
    expect(result.ok).toBe(true)
  })

  it('invalid transition is rejected', async () => {
    const run = makeAdmittedRun()
    await runRepo.save(run)
    // ADMITTED → RUNNING is not a valid transition
    const result = await svc.transition(run.runId, AgentRunState.RUNNING, { evidenceId: 'ev-004', reason: 'skip' })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('invalid')
    // State must be unchanged
    const unchanged = await runRepo.load(run.runId)
    expect(unchanged?.state).toBe(AgentRunState.ADMITTED)
  })

  it('transition on unknown run is rejected', async () => {
    const result = await svc.transition('run-unknown' as unknown as AgentRunId, AgentRunState.READY, { evidenceId: 'ev-x', reason: 'x' })
    expect(result.ok).toBe(false)
  })

  it('transition from terminal state is rejected', async () => {
    const run = { ...makeAdmittedRun(), state: AgentRunState.COMPLETED } as AgentRun
    await runRepo.save(run)
    const result = await svc.transition(run.runId, AgentRunState.RUNNING, { evidenceId: 'ev-005', reason: 'reopen' })
    expect(result.ok).toBe(false)
  })

  it('every transition is appended to immutable history', async () => {
    const run = makeAdmittedRun()
    await runRepo.save(run)
    await svc.transition(run.runId, AgentRunState.READY, { evidenceId: 'ev-006', reason: 'r1' })
    await svc.transition(run.runId, AgentRunState.RUNNING, { evidenceId: 'ev-007', reason: 'r2' })
    const history = await historyRepo.listByRunId(run.runId)
    expect(history).toHaveLength(2)
    expect(history[0]?.toState).toBe(AgentRunState.READY)
    expect(history[1]?.toState).toBe(AgentRunState.RUNNING)
  })

  it('transition is idempotent for same target state', async () => {
    const run = makeAdmittedRun()
    await runRepo.save(run)
    await svc.transition(run.runId, AgentRunState.READY, { evidenceId: 'ev-008', reason: 'r1' })
    // Same transition again — should succeed without duplicating history
    const result = await svc.transition(run.runId, AgentRunState.READY, { evidenceId: 'ev-008', reason: 'r1' })
    expect(result.ok).toBe(true)
    const history = await historyRepo.listByRunId(run.runId)
    expect(history).toHaveLength(1)
  })
})

describe('agent-runtime plan management', () => {
  let runRepo: InMemoryAgentRunRepository
  let planRepo: InMemoryAgentPlanRepository
  let checkpointRepo: InMemoryAgentCheckpointRepository
  let historyRepo: InMemoryAgentRunHistoryRepository
  let svc: AgentRunLifecycleService

  beforeEach(() => {
    runRepo = new InMemoryAgentRunRepository()
    planRepo = new InMemoryAgentPlanRepository()
    checkpointRepo = new InMemoryAgentCheckpointRepository()
    historyRepo = new InMemoryAgentRunHistoryRepository()
    svc = new AgentRunLifecycleService(runRepo, planRepo, checkpointRepo, historyRepo)
  })

  it('can create and activate a plan for a run', async () => {
    const run: AgentRun = {
      runId: 'run-p1' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.RUNNING,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await runRepo.save(run)

    const plan = await svc.createPlan(run.runId, ['task-001' as unknown as AgentTaskId])
    expect(plan.state).toBe(AgentPlanState.DRAFT)

    await svc.activatePlan(plan.planId)
    const activated = await planRepo.load(plan.planId)
    expect(activated?.state).toBe(AgentPlanState.ACTIVE)
  })

  it('superseding a plan marks old plan SUPERSEDED and creates supersession record', async () => {
    const run: AgentRun = {
      runId: 'run-p2' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.RUNNING,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await runRepo.save(run)

    const oldPlan = await svc.createPlan(run.runId, ['task-001' as unknown as AgentTaskId])
    await svc.activatePlan(oldPlan.planId)
    const { newPlan, supersession } = await svc.supersedePlan(oldPlan.planId, 'context-shift')

    const old = await planRepo.load(oldPlan.planId)
    expect(old?.state).toBe(AgentPlanState.SUPERSEDED)
    expect(newPlan.state).toBe(AgentPlanState.DRAFT)
    expect(supersession.oldPlanId).toBe(oldPlan.planId)
    expect(supersession.newPlanId).toBe(newPlan.planId)
  })

  it('cannot activate a SUPERSEDED plan', async () => {
    const run: AgentRun = {
      runId: 'run-p3' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.RUNNING,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await runRepo.save(run)
    const plan = await svc.createPlan(run.runId, ['task-001' as unknown as AgentTaskId])
    await svc.activatePlan(plan.planId)
    await svc.supersedePlan(plan.planId, 'stale')
    await expect(svc.activatePlan(plan.planId)).rejects.toThrow()
  })
})

describe('agent-runtime checkpointing and recovery', () => {
  let runRepo: InMemoryAgentRunRepository
  let planRepo: InMemoryAgentPlanRepository
  let checkpointRepo: InMemoryAgentCheckpointRepository
  let historyRepo: InMemoryAgentRunHistoryRepository
  let svc: AgentRunLifecycleService

  beforeEach(() => {
    runRepo = new InMemoryAgentRunRepository()
    planRepo = new InMemoryAgentPlanRepository()
    checkpointRepo = new InMemoryAgentCheckpointRepository()
    historyRepo = new InMemoryAgentRunHistoryRepository()
    svc = new AgentRunLifecycleService(runRepo, planRepo, checkpointRepo, historyRepo)
  })

  it('can save and restore a checkpoint', async () => {
    const run: AgentRun = {
      runId: 'run-ck1' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.RUNNING,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await runRepo.save(run)
    const plan = await svc.createPlan(run.runId, [])
    const ckpt = await svc.saveCheckpoint(run.runId, plan.planId, { step: 3, progress: 0.6 })

    expect(ckpt.runId).toBe(run.runId)
    expect((ckpt.snapshot as { step: number }).step).toBe(3)

    const loaded = await checkpointRepo.load(ckpt.checkpointId)
    expect(loaded?.checkpointId).toBe(ckpt.checkpointId)
  })

  it('latest checkpoint is retrievable for recovery', async () => {
    const run: AgentRun = {
      runId: 'run-ck2' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.RUNNING,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await runRepo.save(run)
    const plan = await svc.createPlan(run.runId, [])
    await svc.saveCheckpoint(run.runId, plan.planId, { step: 1 })
    await svc.saveCheckpoint(run.runId, plan.planId, { step: 2 })
    const latest = await svc.latestCheckpoint(run.runId)
    expect((latest?.snapshot as { step: number }).step).toBe(2)
  })

  it('pause moves run to SUSPENDED', async () => {
    const run: AgentRun = {
      runId: 'run-ck3' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.RUNNING,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await runRepo.save(run)
    await svc.transition(run.runId, AgentRunState.SUSPENDED, { evidenceId: 'ev-pause', reason: 'user-pause' })
    const updated = await runRepo.load(run.runId)
    expect(updated?.state).toBe(AgentRunState.SUSPENDED)
  })

  it('resume from SUSPENDED → RUNNING is valid', async () => {
    const run: AgentRun = {
      runId: 'run-ck4' as unknown as AgentRunId,
      instanceId: 'inst-001' as unknown as AgentInstanceId,
      definitionId: 'def-001' as unknown as AgentDefinitionId,
      versionId: 'ver-001' as unknown as AgentVersionId,
      state: AgentRunState.SUSPENDED,
      startedAt: new Date(),
      admittedAt: new Date(),
    }
    await runRepo.save(run)
    const result = await svc.transition(run.runId, AgentRunState.RUNNING, { evidenceId: 'ev-resume', reason: 'resumed' })
    expect(result.ok).toBe(true)
    const updated = await runRepo.load(run.runId)
    expect(updated?.state).toBe(AgentRunState.RUNNING)
  })
})
