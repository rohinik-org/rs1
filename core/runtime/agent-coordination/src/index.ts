import { createHash } from 'node:crypto'
import type {
  AgentRunId,
  AgentTaskId,
} from '@rohinik-org/agent-ir'
import type { DelegatedTaskId } from '@rohinik-org/agent-delegation'

// ── Branded IDs ───────────────────────────────────────────────────────────────

declare const _mailboxId:            unique symbol
declare const _coordinationMessageId: unique symbol
declare const _coordinationTeamId:   unique symbol
declare const _coordinationPlanId:   unique symbol
declare const _workClaimId:          unique symbol
declare const _placementBindingId:   unique symbol
declare const _attemptId:            unique symbol

export type MailboxId             = string & { readonly [_mailboxId]: never }
export type CoordinationMessageId = string & { readonly [_coordinationMessageId]: never }
export type CoordinationTeamId    = string & { readonly [_coordinationTeamId]: never }
export type CoordinationPlanId    = string & { readonly [_coordinationPlanId]: never }
export type WorkClaimId           = string & { readonly [_workClaimId]: never }
export type PlacementBindingId    = string & { readonly [_placementBindingId]: never }
export type AttemptId             = string & { readonly [_attemptId]: never }

// ── ID utility ────────────────────────────────────────────────────────────────

let _seq = 0
// ponytail: seq counter for in-memory id uniqueness; replace with UUID generator when persistence requires it
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_seq}`

// ── Task 9: Message hash ──────────────────────────────────────────────────────

export interface MessageHashParams {
  readonly fromRunId:    AgentRunId
  readonly toMailboxId:  MailboxId
  readonly content:      unknown
  readonly sentAt?:      Date  // optional; omit for dedup hashing (content-only key)
}

export function buildMessageHash(params: MessageHashParams): string {
  const body = JSON.stringify({
    fromRunId:   params.fromRunId,
    toMailboxId: params.toMailboxId,
    content:     params.content,
    ...(params.sentAt !== undefined && { sentAt: params.sentAt.toISOString() }),
  })
  return createHash('sha256').update(body).digest('hex')
}

// ── Task 9: CoordinationMessage ───────────────────────────────────────────────

export interface CoordinationMessage {
  readonly messageId:     CoordinationMessageId
  readonly fromRunId:     AgentRunId
  readonly toMailboxId:   MailboxId
  readonly content:       unknown   // null when redacted
  readonly correlationId?: string
  readonly causationId?:  string
  readonly contentHash:   string    // SHA-256 of original content; preserved on redaction
  readonly sentAt:        Date
  readonly expiresAt?:    Date
  readonly redacted:      boolean
}

export interface CoordinationMailbox {
  readonly mailboxId:   MailboxId
  readonly ownerRunId:  AgentRunId
  readonly messages:    ReadonlyArray<CoordinationMessage>
}

// ── Task 9: Repositories ──────────────────────────────────────────────────────

export interface MailboxRepository {
  save(mailbox: CoordinationMailbox): Promise<void>
  load(mailboxId: MailboxId): Promise<CoordinationMailbox | undefined>
}

export class InMemoryMailboxRepository implements MailboxRepository {
  private store = new Map<string, CoordinationMailbox>()
  async save(mailbox: CoordinationMailbox): Promise<void>                       { this.store.set(mailbox.mailboxId, mailbox) }
  async load(mailboxId: MailboxId): Promise<CoordinationMailbox | undefined>    { return this.store.get(mailboxId) }
}

// ── Task 9: Policy port ───────────────────────────────────────────────────────

export interface MessagingPolicyPort {
  check(fromRunId: AgentRunId, toMailboxId: MailboxId, content: unknown): Promise<{ allowed: boolean; reason?: string }>
}

// ── Task 9: CoordinationMessagingService ─────────────────────────────────────

export interface SendParams {
  readonly fromRunId:     AgentRunId
  readonly toMailboxId:   MailboxId
  readonly content:       unknown
  readonly correlationId?: string
  readonly causationId?:  string
  readonly expiresAt?:    Date
}

export class CoordinationMessagingService {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly policy?: MessagingPolicyPort,
  ) {}

  async createMailbox(ownerRunId: AgentRunId): Promise<CoordinationMailbox> {
    const mailbox: CoordinationMailbox = {
      mailboxId:  nextId('mb') as unknown as MailboxId,
      ownerRunId,
      messages:   [],
    }
    await this.mailboxes.save(mailbox)
    return mailbox
  }

  async send(params: SendParams): Promise<CoordinationMessage> {
    const mailbox = await this.mailboxes.load(params.toMailboxId)
    if (!mailbox) throw new Error('mailbox-not-found')

    if (this.policy) {
      const check = await this.policy.check(params.fromRunId, params.toMailboxId, params.content)
      if (!check.allowed) throw new Error(check.reason ?? 'policy-denied')
    }

    const contentHash = buildMessageHash({
      fromRunId:   params.fromRunId,
      toMailboxId: params.toMailboxId,
      content:     params.content,
    })

    // Deduplication: if a message with the same hash exists, skip
    if (mailbox.messages.some(m => m.contentHash === contentHash)) {
      return mailbox.messages.find(m => m.contentHash === contentHash)!
    }

    const msg: CoordinationMessage = {
      messageId:    nextId('msg') as unknown as CoordinationMessageId,
      fromRunId:    params.fromRunId,
      toMailboxId:  params.toMailboxId,
      content:      params.content,
      contentHash,
      sentAt:       new Date(),
      redacted:     false,
      ...(params.correlationId !== undefined && { correlationId: params.correlationId }),
      ...(params.causationId   !== undefined && { causationId:   params.causationId }),
      ...(params.expiresAt     !== undefined && { expiresAt:     params.expiresAt }),
    }

    await this.mailboxes.save({ ...mailbox, messages: [...mailbox.messages, msg] })
    return msg
  }

  async readMessages(mailboxId: MailboxId): Promise<ReadonlyArray<CoordinationMessage>> {
    const mailbox = await this.mailboxes.load(mailboxId)
    if (!mailbox) throw new Error('mailbox-not-found')
    const now = Date.now()
    return mailbox.messages.filter(m => !m.expiresAt || m.expiresAt.getTime() > now)
  }

  async acknowledge(mailboxId: MailboxId, messageId: CoordinationMessageId): Promise<void> {
    const mailbox = await this.mailboxes.load(mailboxId)
    if (!mailbox) throw new Error('mailbox-not-found')
    await this.mailboxes.save({ ...mailbox, messages: mailbox.messages.filter(m => m.messageId !== messageId) })
  }

  async redact(mailboxId: MailboxId, messageId: CoordinationMessageId): Promise<void> {
    const mailbox = await this.mailboxes.load(mailboxId)
    if (!mailbox) throw new Error('mailbox-not-found')
    const messages = mailbox.messages.map(m =>
      m.messageId === messageId ? { ...m, content: null, redacted: true } : m
    )
    await this.mailboxes.save({ ...mailbox, messages })
  }
}

// ── Task 10: Teams ────────────────────────────────────────────────────────────

export interface TeamBarrier {
  readonly barrierId:        string
  readonly requiredTaskIds:  ReadonlyArray<AgentTaskId>
}

export interface CoordinationTeam {
  readonly coordinationTeamId: CoordinationTeamId
  readonly name:               string
  readonly leaderId:           AgentRunId
  readonly members:            ReadonlyArray<AgentRunId>
  readonly version:            number
  readonly createdAt:          Date
}

export interface TeamChangeRecord {
  readonly changeId:    string
  readonly teamId:      CoordinationTeamId
  readonly fromVersion: number
  readonly toVersion:   number
  readonly change:      'member-added' | 'member-removed'
  readonly affected:    AgentRunId
  readonly changedAt:   Date
}

export interface CoordinationTeamRepository {
  save(team: CoordinationTeam): Promise<void>
  load(teamId: CoordinationTeamId): Promise<CoordinationTeam | undefined>
  appendChange(record: TeamChangeRecord): Promise<void>
  listChanges(teamId: CoordinationTeamId): Promise<TeamChangeRecord[]>
}

export class InMemoryCoordinationTeamRepository implements CoordinationTeamRepository {
  private teams   = new Map<string, CoordinationTeam>()
  private changes = new Map<string, TeamChangeRecord[]>()
  async save(team: CoordinationTeam): Promise<void>                                   { this.teams.set(team.coordinationTeamId, team) }
  async load(teamId: CoordinationTeamId): Promise<CoordinationTeam | undefined>       { return this.teams.get(teamId) }
  async appendChange(record: TeamChangeRecord): Promise<void> {
    const list = this.changes.get(record.teamId) ?? []
    this.changes.set(record.teamId, [...list, record])
  }
  async listChanges(teamId: CoordinationTeamId): Promise<TeamChangeRecord[]>          { return [...(this.changes.get(teamId) ?? [])] }
}

export interface CreateTeamParams {
  readonly leaderId:  AgentRunId
  readonly memberIds: ReadonlyArray<AgentRunId>
  readonly name:      string
}

export class CoordinationTeamService {
  constructor(private readonly teams: CoordinationTeamRepository) {}

  async createTeam(params: CreateTeamParams): Promise<CoordinationTeam> {
    const team: CoordinationTeam = {
      coordinationTeamId: nextId('team') as unknown as CoordinationTeamId,
      name:      params.name,
      leaderId:  params.leaderId,
      members:   params.memberIds,
      version:   1,
      createdAt: new Date(),
    }
    await this.teams.save(team)
    return team
  }

  async addMember(teamId: CoordinationTeamId, runId: AgentRunId): Promise<CoordinationTeam> {
    const team = await this._load(teamId)
    const updated: CoordinationTeam = { ...team, members: [...team.members, runId], version: team.version + 1 }
    await this.teams.save(updated)
    await this.teams.appendChange({ changeId: nextId('chg'), teamId, fromVersion: team.version, toVersion: updated.version, change: 'member-added', affected: runId, changedAt: new Date() })
    return updated
  }

  async removeMember(teamId: CoordinationTeamId, runId: AgentRunId): Promise<CoordinationTeam> {
    const team = await this._load(teamId)
    if (runId === team.leaderId) throw new Error('cannot-remove-leader')
    const updated: CoordinationTeam = { ...team, members: team.members.filter(m => m !== runId), version: team.version + 1 }
    await this.teams.save(updated)
    await this.teams.appendChange({ changeId: nextId('chg'), teamId, fromVersion: team.version, toVersion: updated.version, change: 'member-removed', affected: runId, changedAt: new Date() })
    return updated
  }

  private async _load(teamId: CoordinationTeamId): Promise<CoordinationTeam> {
    const team = await this.teams.load(teamId)
    if (!team) throw new Error('team-not-found')
    return team
  }
}

// ── Task 10: Coordination plans and work claims ───────────────────────────────

export interface CoordinationPlan {
  readonly coordinationPlanId: CoordinationPlanId
  readonly teamId:             CoordinationTeamId
  readonly taskIds:            ReadonlyArray<AgentTaskId>
  readonly barriers:           ReadonlyArray<TeamBarrier>
  readonly version:            number
  readonly createdAt:          Date
}

export interface WorkClaim {
  readonly workClaimId: WorkClaimId
  readonly planId:      CoordinationPlanId
  readonly taskId:      AgentTaskId
  readonly claimedBy:   AgentRunId
  readonly claimedAt:   Date
}

export interface CoordinationPlanRepository {
  save(plan: CoordinationPlan): Promise<void>
  load(planId: CoordinationPlanId): Promise<CoordinationPlan | undefined>
}

export interface WorkClaimRepository {
  save(claim: WorkClaim): Promise<void>
  listByPlan(planId: CoordinationPlanId): Promise<WorkClaim[]>
}

export class InMemoryCoordinationPlanRepository implements CoordinationPlanRepository {
  private store = new Map<string, CoordinationPlan>()
  async save(plan: CoordinationPlan): Promise<void>                                { this.store.set(plan.coordinationPlanId, plan) }
  async load(planId: CoordinationPlanId): Promise<CoordinationPlan | undefined>   { return this.store.get(planId) }
}

export class InMemoryWorkClaimRepository implements WorkClaimRepository {
  private store = new Map<string, WorkClaim>()
  async save(claim: WorkClaim): Promise<void> { this.store.set(claim.workClaimId, claim) }
  async listByPlan(planId: CoordinationPlanId): Promise<WorkClaim[]> {
    return [...this.store.values()].filter(c => c.planId === planId)
  }
}

export interface CreatePlanParams {
  readonly teamId:   CoordinationTeamId
  readonly taskIds:  ReadonlyArray<AgentTaskId>
  readonly barriers: ReadonlyArray<TeamBarrier>
}

export class CoordinationPlanService {
  constructor(
    private readonly plans:  CoordinationPlanRepository,
    private readonly claims: WorkClaimRepository,
  ) {}

  async createPlan(params: CreatePlanParams): Promise<CoordinationPlan> {
    const plan: CoordinationPlan = {
      coordinationPlanId: nextId('cplan') as unknown as CoordinationPlanId,
      teamId:   params.teamId,
      taskIds:  params.taskIds,
      barriers: params.barriers,
      version:  1,
      createdAt: new Date(),
    }
    await this.plans.save(plan)
    return plan
  }

  async claimWork(planId: CoordinationPlanId, taskId: AgentTaskId, runId: AgentRunId): Promise<WorkClaim> {
    const existing = await this.claims.listByPlan(planId)
    if (existing.some(c => c.taskId === taskId)) throw new Error('task-already-claimed')
    const claim: WorkClaim = {
      workClaimId: nextId('wc') as unknown as WorkClaimId,
      planId,
      taskId,
      claimedBy:  runId,
      claimedAt:  new Date(),
    }
    await this.claims.save(claim)
    return claim
  }

  async isBarrierCleared(planId: CoordinationPlanId, barrierId: string): Promise<boolean> {
    const plan = await this.plans.load(planId)
    if (!plan) throw new Error('plan-not-found')
    const barrier = plan.barriers.find(b => b.barrierId === barrierId)
    if (!barrier) throw new Error('barrier-not-found')
    const claims = await this.claims.listByPlan(planId)
    const claimedTaskIds = new Set(claims.map(c => c.taskId))
    return barrier.requiredTaskIds.every(t => claimedTaskIds.has(t))
  }
}

// ── Task 10: Conflict resolution + deadlock detection ────────────────────────

export function resolveConflict(claims: ReadonlyArray<WorkClaim>): AgentRunId {
  const sorted = [...claims].sort((a, b) => {
    const timeDiff = a.claimedAt.getTime() - b.claimedAt.getTime()
    if (timeDiff !== 0) return timeDiff
    return a.claimedBy < b.claimedBy ? -1 : 1  // lexical tie-break
  })
  return sorted[0]!.claimedBy
}

export function detectDeadlock(waitFor: ReadonlyMap<AgentRunId, AgentRunId>): ReadonlyArray<AgentRunId> | null {
  // Floyd-style: DFS cycle detection over wait-for graph
  const visited = new Set<AgentRunId>()
  const inStack = new Set<AgentRunId>()

  const dfs = (node: AgentRunId, path: AgentRunId[]): AgentRunId[] | null => {
    if (inStack.has(node)) return path.slice(path.indexOf(node))
    if (visited.has(node)) return null
    visited.add(node)
    inStack.add(node)
    const next = waitFor.get(node)
    if (next) {
      const cycle = dfs(next, [...path, node])
      if (cycle) return cycle
    }
    inStack.delete(node)
    return null
  }

  for (const node of waitFor.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node, [])
      if (cycle) return cycle
    }
  }
  return null
}

// ── Task 11: Placement binding ────────────────────────────────────────────────

export interface AgentPlacementBinding {
  readonly placementBindingId:  PlacementBindingId
  readonly runId:               AgentRunId
  readonly delegatedTaskId?:    DelegatedTaskId
  readonly placementId:         string  // compatible with Stage 14 PlacementId; no SDK import
  readonly nodeId:              string  // compatible with Stage 14 NodeId
  readonly federationId:        string  // compatible with Stage 14 FederationId
  readonly attemptId:           AttemptId
  readonly previousAttemptId?:  AttemptId
  readonly failoverReason?:     string
  readonly checkpointPolicy?:   string
  readonly boundAt:             Date
}

export interface PlacementBindingRepository {
  save(binding: AgentPlacementBinding): Promise<void>
  load(id: PlacementBindingId): Promise<AgentPlacementBinding | undefined>
  loadByRunId(runId: AgentRunId): Promise<AgentPlacementBinding[]>
}

export class InMemoryPlacementBindingRepository implements PlacementBindingRepository {
  private store = new Map<string, AgentPlacementBinding>()
  async save(binding: AgentPlacementBinding): Promise<void>                                { this.store.set(binding.placementBindingId, binding) }
  async load(id: PlacementBindingId): Promise<AgentPlacementBinding | undefined>          { return this.store.get(id) }
  async loadByRunId(runId: AgentRunId): Promise<AgentPlacementBinding[]>                  { return [...this.store.values()].filter(b => b.runId === runId) }
}

export interface PlacementPort {
  getPlacement(runId: AgentRunId): Promise<{ placementId: string; nodeId: string; federationId: string }>
}

export interface BindParams {
  readonly runId:              AgentRunId
  readonly delegatedTaskId?:   DelegatedTaskId
  readonly placementId:        string
  readonly nodeId:             string
  readonly federationId:       string
  readonly checkpointPolicy?:  string
}

export class AgentPlacementService {
  constructor(private readonly bindings: PlacementBindingRepository) {}

  async bind(params: BindParams): Promise<AgentPlacementBinding> {
    const binding: AgentPlacementBinding = {
      placementBindingId: nextId('pbind') as unknown as PlacementBindingId,
      runId:            params.runId,
      placementId:      params.placementId,
      nodeId:           params.nodeId,
      federationId:     params.federationId,
      attemptId:        nextId('attempt') as unknown as AttemptId,
      boundAt:          new Date(),
      ...(params.delegatedTaskId  !== undefined && { delegatedTaskId:  params.delegatedTaskId }),
      ...(params.checkpointPolicy !== undefined && { checkpointPolicy: params.checkpointPolicy }),
    }
    await this.bindings.save(binding)
    return binding
  }

  async failover(bindingId: PlacementBindingId, newNodeId: string, reason: string): Promise<AgentPlacementBinding> {
    const existing = await this.bindings.load(bindingId)
    if (!existing) throw new Error('binding-not-found')

    const failedOver: AgentPlacementBinding = {
      placementBindingId: nextId('pbind') as unknown as PlacementBindingId,
      runId:             existing.runId,
      placementId:       existing.placementId,
      nodeId:            newNodeId,
      federationId:      existing.federationId,
      attemptId:         nextId('attempt') as unknown as AttemptId,
      previousAttemptId: existing.attemptId,
      failoverReason:    reason,
      boundAt:           new Date(),
      ...(existing.delegatedTaskId  !== undefined && { delegatedTaskId:  existing.delegatedTaskId }),
      ...(existing.checkpointPolicy !== undefined && { checkpointPolicy: existing.checkpointPolicy }),
    }
    await this.bindings.save(failedOver)
    return failedOver
  }
}
