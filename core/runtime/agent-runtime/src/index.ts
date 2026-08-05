import type {
  AgentInstance,
  AgentVersion,
  AgentRun,
  AgentInstanceId,
  AgentVersionId,
  AgentRunId,
} from '@rohinik-org/agent-ir'
import { AgentRunState } from '@rohinik-org/agent-ir'

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

    const runId = `run-${request.instanceId}-${Date.now()}` as unknown as AgentRunId
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
