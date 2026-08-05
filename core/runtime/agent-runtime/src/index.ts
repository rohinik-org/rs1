import type {
  AgentInstance,
  AgentVersion,
  AgentRun,
  AgentPlan,
  AgentCheckpoint,
  AgentSupersession,
  AgentInstanceId,
  AgentVersionId,
  AgentRunId,
  AgentPlanId,
  AgentTaskId,
  AgentCheckpointId,
  SupersessionId,
} from '@rohinik-org/agent-ir'
import {
  AgentRunState,
  AgentRunTransitions,
  AgentRunTerminalStates,
  AgentPlanState,
  AgentPlanTransitions,
} from '@rohinik-org/agent-ir'

// ── Ports ─────────────────────────────────────────────────────────────────────

export interface PolicyPort {
  evaluate(instanceId: AgentInstanceId, versionId: AgentVersionId): Promise<{ allowed: boolean; reason?: string }>
}

export interface CapabilityPort {
  checkAvailable(requirements: ReadonlyArray<{ capabilityId: string; required: boolean }>): Promise<{ available: boolean; missing?: string[] }>
}

export interface BudgetPort {
  checkBudget(versionId: AgentVersionId): Promise<{ sufficient: boolean; reason?: string }>
}

// ── Repositories ──────────────────────────────────────────────────────────────

export interface AgentInstanceRepository {
  save(instance: AgentInstance): Promise<void>
  load(instanceId: AgentInstanceId): Promise<AgentInstance | undefined>
}

export interface AgentVersionRepository {
  save(version: AgentVersion): Promise<void>
  load(versionId: AgentVersionId): Promise<AgentVersion | undefined>
}

export interface AgentRunRepository {
  save(run: AgentRun): Promise<void>
  load(runId: AgentRunId): Promise<AgentRun | undefined>
  loadByInstanceId(instanceId: AgentInstanceId): Promise<AgentRun[]>
}

export class InMemoryAgentInstanceRepository implements AgentInstanceRepository {
  private store = new Map<string, AgentInstance>()
  async save(instance: AgentInstance): Promise<void> { this.store.set(instance.instanceId, instance) }
  async load(instanceId: AgentInstanceId): Promise<AgentInstance | undefined> { return this.store.get(instanceId) }
}

export class InMemoryAgentVersionRepository implements AgentVersionRepository {
  private store = new Map<string, AgentVersion>()
  async save(version: AgentVersion): Promise<void> { this.store.set(version.versionId, version) }
  async load(versionId: AgentVersionId): Promise<AgentVersion | undefined> { return this.store.get(versionId) }
}

export class InMemoryAgentRunRepository implements AgentRunRepository {
  private store = new Map<string, AgentRun>()
  async save(run: AgentRun): Promise<void> { this.store.set(run.runId, run) }
  async load(runId: AgentRunId): Promise<AgentRun | undefined> { return this.store.get(runId) }
  async loadByInstanceId(instanceId: AgentInstanceId): Promise<AgentRun[]> {
    return [...this.store.values()].filter(r => r.instanceId === instanceId)
  }
}

// ── Admission ─────────────────────────────────────────────────────────────────

export interface AgentAdmissionRequest {
  readonly instanceId:   AgentInstanceId
  readonly requestedAt:  Date
}

export interface AgentAdmissionResult {
  readonly admitted: boolean
  readonly runId?:   AgentRunId
  readonly reason?:  string
}

export class AgentAdmissionService {
  constructor(
    private readonly instances:   AgentInstanceRepository,
    private readonly versions:    AgentVersionRepository,
    private readonly runs:        AgentRunRepository,
    private readonly policy:      PolicyPort,
    private readonly capabilities: CapabilityPort,
    private readonly budget:      BudgetPort,
  ) {}

  async admit(request: AgentAdmissionRequest): Promise<AgentAdmissionResult> {
    const instance = await this.instances.load(request.instanceId)
    if (!instance) return { admitted: false, reason: 'instance-not-found' }

    const version = await this.versions.load(instance.versionId)
    if (!version) return { admitted: false, reason: 'version-not-found' }

    const policyResult = await this.policy.evaluate(instance.instanceId, version.versionId)
    if (!policyResult.allowed) return { admitted: false, reason: policyResult.reason ?? 'policy-denied' }

    const capResult = await this.capabilities.checkAvailable(version.capabilityRequirements)
    if (!capResult.available) return { admitted: false, reason: `capability-unavailable: ${(capResult.missing ?? []).join(', ')}` }

    const budgetResult = await this.budget.checkBudget(version.versionId)
    if (!budgetResult.sufficient) return { admitted: false, reason: `budget-insufficient: ${budgetResult.reason ?? ''}` }

    const runId = nextId(`run-${request.instanceId}`) as unknown as AgentRunId
    const run: AgentRun = {
      runId,
      instanceId:   instance.instanceId,
      definitionId: instance.definitionId,
      versionId:    version.versionId,
      state:        AgentRunState.ADMITTED,
      startedAt:    request.requestedAt,
      admittedAt:   request.requestedAt,
    }
    await this.runs.save(run)
    return { admitted: true, runId }
  }
}

// ── Task 5: Plan, Checkpoint, History repositories ───────────────────────────

export interface AgentPlanRepository {
  save(plan: AgentPlan): Promise<void>
  load(planId: AgentPlanId): Promise<AgentPlan | undefined>
  listByRunId(runId: AgentRunId): Promise<AgentPlan[]>
}

export interface AgentCheckpointRepository {
  save(checkpoint: AgentCheckpoint): Promise<void>
  load(checkpointId: AgentCheckpointId): Promise<AgentCheckpoint | undefined>
  listByRunId(runId: AgentRunId): Promise<AgentCheckpoint[]>
}

export interface AgentRunTransitionRecord {
  readonly runId:      AgentRunId
  readonly fromState:  AgentRunState
  readonly toState:    AgentRunState
  readonly evidenceId: string
  readonly reason:     string
  readonly occurredAt: Date
}

export interface AgentRunHistoryRepository {
  append(record: AgentRunTransitionRecord): Promise<void>
  listByRunId(runId: AgentRunId): Promise<AgentRunTransitionRecord[]>
}

export class InMemoryAgentPlanRepository implements AgentPlanRepository {
  private store = new Map<string, AgentPlan>()
  async save(plan: AgentPlan): Promise<void> { this.store.set(plan.planId, plan) }
  async load(planId: AgentPlanId): Promise<AgentPlan | undefined> { return this.store.get(planId) }
  async listByRunId(runId: AgentRunId): Promise<AgentPlan[]> {
    return [...this.store.values()].filter(p => p.runId === runId)
  }
}

export class InMemoryAgentCheckpointRepository implements AgentCheckpointRepository {
  private store = new Map<string, AgentCheckpoint>()
  async save(ckpt: AgentCheckpoint): Promise<void> { this.store.set(ckpt.checkpointId, ckpt) }
  async load(checkpointId: AgentCheckpointId): Promise<AgentCheckpoint | undefined> { return this.store.get(checkpointId) }
  async listByRunId(runId: AgentRunId): Promise<AgentCheckpoint[]> {
    return [...this.store.values()].filter(c => c.runId === runId)
  }
}

export class InMemoryAgentRunHistoryRepository implements AgentRunHistoryRepository {
  private store = new Map<string, AgentRunTransitionRecord[]>()
  async append(record: AgentRunTransitionRecord): Promise<void> {
    const list = this.store.get(record.runId) ?? []
    this.store.set(record.runId, [...list, record])
  }
  async listByRunId(runId: AgentRunId): Promise<AgentRunTransitionRecord[]> {
    return [...(this.store.get(runId) ?? [])]
  }
}

// ── Task 5: Run lifecycle service ─────────────────────────────────────────────

export interface TransitionEvidence {
  readonly evidenceId: string
  readonly reason:     string
}

export interface TransitionResult {
  readonly ok:     boolean
  readonly reason?: string
}

let _seq = 0
// ponytail: seq counter for in-memory id uniqueness; replace with UUID generator when persistence requires it
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_seq}`

export class AgentRunLifecycleService {
  constructor(
    private readonly runs:        AgentRunRepository,
    private readonly plans:       AgentPlanRepository,
    private readonly checkpoints: AgentCheckpointRepository,
    private readonly history:     AgentRunHistoryRepository,
  ) {}

  async transition(runId: AgentRunId, toState: AgentRunState, evidence: TransitionEvidence): Promise<TransitionResult> {
    const run = await this.runs.load(runId)
    if (!run) return { ok: false, reason: 'run-not-found' }

    // Idempotent: already in target state
    if (run.state === toState) return { ok: true }

    const allowed = AgentRunTransitions[run.state] as ReadonlyArray<AgentRunState>
    if (!allowed.includes(toState)) {
      return { ok: false, reason: `invalid-transition: ${run.state} → ${toState}` }
    }

    const updated: AgentRun = { ...run, state: toState }
    await this.runs.save(updated)
    await this.history.append({
      runId,
      fromState:  run.state,
      toState,
      evidenceId: evidence.evidenceId,
      reason:     evidence.reason,
      occurredAt: new Date(),
    })
    return { ok: true }
  }

  async createPlan(runId: AgentRunId, tasks: ReadonlyArray<AgentTaskId>): Promise<AgentPlan> {
    const planId = nextId(`plan-${runId}`) as unknown as AgentPlanId
    const plan: AgentPlan = {
      planId,
      runId,
      state: AgentPlanState.DRAFT,
      tasks,
      createdAt: new Date(),
    }
    await this.plans.save(plan)
    return plan
  }

  async activatePlan(planId: AgentPlanId): Promise<void> {
    const plan = await this.plans.load(planId)
    if (!plan) throw new Error('plan-not-found')
    const allowed = AgentPlanTransitions[plan.state] as ReadonlyArray<AgentPlanState>
    if (!allowed.includes(AgentPlanState.ACTIVE)) {
      throw new Error(`invalid-plan-transition: ${plan.state} → ACTIVE`)
    }
    await this.plans.save({ ...plan, state: AgentPlanState.ACTIVE, activatedAt: new Date() })
  }

  async supersedePlan(oldPlanId: AgentPlanId, reason: string): Promise<{ newPlan: AgentPlan; supersession: AgentSupersession }> {
    const old = await this.plans.load(oldPlanId)
    if (!old) throw new Error('plan-not-found')
    if (old.state !== AgentPlanState.ACTIVE) throw new Error(`cannot-supersede: ${old.state}`)

    await this.plans.save({ ...old, state: AgentPlanState.SUPERSEDED })

    const newPlan = await this.createPlan(old.runId, old.tasks)
    const supersession: AgentSupersession = {
      supersessionId: nextId(`sup-${oldPlanId}`) as unknown as SupersessionId,
      oldPlanId,
      newPlanId: newPlan.planId,
      reason,
      supersededAt: new Date(),
    }
    return { newPlan, supersession }
  }

  async saveCheckpoint(runId: AgentRunId, planId: AgentPlanId, snapshot: unknown): Promise<AgentCheckpoint> {
    const checkpointId = nextId(`ckpt-${runId}`) as unknown as AgentCheckpointId
    const ckpt: AgentCheckpoint = { checkpointId, runId, planId, snapshot, recordedAt: new Date() }
    await this.checkpoints.save(ckpt)
    return ckpt
  }

  async latestCheckpoint(runId: AgentRunId): Promise<AgentCheckpoint | undefined> {
    const all = await this.checkpoints.listByRunId(runId)
    return all.length === 0 ? undefined : all[all.length - 1]
  }
}
