import { describe, it, expect, beforeEach } from 'vitest'
import type {
  AgentAdmissionRequest,
  AgentAdmissionResult,
  AgentInstanceRepository,
  AgentVersionRepository,
  AgentRunRepository,
  PolicyPort,
  CapabilityPort,
  BudgetPort,
} from './index.js'
import {
  AgentAdmissionService,
  InMemoryAgentInstanceRepository,
  InMemoryAgentVersionRepository,
  InMemoryAgentRunRepository,
} from './index.js'
import type {
  AgentInstance,
  AgentVersion,
  AgentRun,
  AgentInstanceId,
  AgentDefinitionId,
  AgentVersionId,
  AgentRunId,
} from '@rohinik-org/agent-ir'
import { AgentRunState } from '@rohinik-org/agent-ir'

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
