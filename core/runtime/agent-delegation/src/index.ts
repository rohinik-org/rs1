import { createHash } from 'node:crypto'
import type {
  AgentRunId,
  AgentTaskId,
  DelegationId,
  AgentAuthority,
  AgentBudget,
} from '@rohinik-org/agent-ir'

// ── Branded IDs ───────────────────────────────────────────────────────────────

declare const _certificateId: unique symbol
declare const _delegatedTaskId: unique symbol
export type CertificateId   = string & { readonly [_certificateId]: never }
export type DelegatedTaskId = string & { readonly [_delegatedTaskId]: never }

// ── Attenuated authority/budget types ─────────────────────────────────────────

export interface DelegatedAuthority {
  readonly allowedCapabilities: ReadonlyArray<string>
  readonly allowedActions:      ReadonlyArray<string>
  readonly deniedActions:       ReadonlyArray<string>
  readonly maxDelegationDepth:  number
}

export interface DelegatedBudget {
  readonly maxCostUsd:   number
  readonly maxLatencyMs: number
  readonly maxTokens:    number
}

// ── Attenuation validation ────────────────────────────────────────────────────

export interface AttenuationResult {
  readonly valid:      boolean
  readonly violations: ReadonlyArray<string>
}

export function validateAttenuation(
  parentAuth: AgentAuthority,
  parentBudget: AgentBudget,
  childAuth: DelegatedAuthority,
  childBudget: DelegatedBudget,
): AttenuationResult {
  const violations: string[] = []
  const parentCaps = new Set(parentAuth.allowedCapabilities)
  const parentActions = new Set(parentAuth.allowedActions)

  for (const cap of childAuth.allowedCapabilities) {
    if (!parentCaps.has(cap)) { violations.push('capability-exceeds-parent'); break }
  }
  for (const action of childAuth.allowedActions) {
    if (!parentActions.has(action)) { violations.push('action-exceeds-parent'); break }
  }
  // Child depth must be strictly less than parent (child cannot re-delegate as deeply)
  if (childAuth.maxDelegationDepth >= parentAuth.maxDelegationDepth) {
    violations.push('depth-exceeds-parent')
  }
  if (childBudget.maxCostUsd   > parentBudget.maxCostUsd)   violations.push('cost-exceeds-parent')
  if (childBudget.maxLatencyMs > parentBudget.maxLatencyMs) violations.push('latency-exceeds-parent')
  if (childBudget.maxTokens    > parentBudget.maxTokens)    violations.push('tokens-exceeds-parent')

  return { valid: violations.length === 0, violations }
}

// ── DelegationCertificate ─────────────────────────────────────────────────────

export interface DelegationCertificate {
  readonly certificateId:   CertificateId
  readonly delegationId:    DelegationId
  readonly delegatorRunId:  AgentRunId
  readonly delegateeRunId:  AgentRunId
  readonly grantedAuthority: DelegatedAuthority
  readonly grantedBudget:   DelegatedBudget
  readonly taskId:          AgentTaskId
  readonly fingerprint:     string   // SHA-256 of canonical cert body; deterministic
  readonly issuedAt:        Date
  readonly revoked:         boolean
}

export interface IssueCertificateParams {
  readonly delegationId:    DelegationId
  readonly delegatorRunId:  AgentRunId
  readonly delegateeRunId:  AgentRunId
  readonly parentAuthority: AgentAuthority
  readonly parentBudget:    AgentBudget
  readonly grantedAuthority: DelegatedAuthority
  readonly grantedBudget:   DelegatedBudget
  readonly taskId:          AgentTaskId
  readonly issuedAt:        Date
}

let _seq = 0
// ponytail: seq counter for in-memory id uniqueness; replace with UUID generator when persistence requires it
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_seq}`

export function issueCertificate(params: IssueCertificateParams): DelegationCertificate {
  const result = validateAttenuation(params.parentAuthority, params.parentBudget, params.grantedAuthority, params.grantedBudget)
  if (!result.valid) {
    throw new Error(`attenuation-violated: ${result.violations.join(', ')}`)
  }

  const body = JSON.stringify({
    delegationId:    params.delegationId,
    delegatorRunId:  params.delegatorRunId,
    delegateeRunId:  params.delegateeRunId,
    taskId:          params.taskId,
    grantedAuthority: {
      allowedCapabilities: [...params.grantedAuthority.allowedCapabilities].sort(),
      allowedActions:      [...params.grantedAuthority.allowedActions].sort(),
      deniedActions:       [...params.grantedAuthority.deniedActions].sort(),
      maxDelegationDepth:  params.grantedAuthority.maxDelegationDepth,
    },
    grantedBudget: params.grantedBudget,
    issuedAt: params.issuedAt.toISOString(),
  })

  const fingerprint = createHash('sha256').update(body).digest('hex')
  const certificateId = nextId(`cert-${params.delegationId}`) as unknown as CertificateId

  return Object.freeze({
    certificateId,
    delegationId:    params.delegationId,
    delegatorRunId:  params.delegatorRunId,
    delegateeRunId:  params.delegateeRunId,
    grantedAuthority: params.grantedAuthority,
    grantedBudget:   params.grantedBudget,
    taskId:          params.taskId,
    fingerprint,
    issuedAt:        params.issuedAt,
    revoked:         false,
  })
}

// ── Certificate repository ────────────────────────────────────────────────────

export interface CertificateRepository {
  save(cert: DelegationCertificate): Promise<void>
  load(certId: CertificateId): Promise<DelegationCertificate | undefined>
  revoke(certId: CertificateId): Promise<void>
}

export class InMemoryCertificateRepository implements CertificateRepository {
  private store = new Map<string, DelegationCertificate>()
  async save(cert: DelegationCertificate): Promise<void>  { this.store.set(cert.certificateId, cert) }
  async load(certId: CertificateId): Promise<DelegationCertificate | undefined> { return this.store.get(certId) }
  async revoke(certId: CertificateId): Promise<void> {
    const cert = this.store.get(certId)
    if (cert) this.store.set(certId, Object.freeze({ ...cert, revoked: true }))
  }
}

// ── Task 8: DelegatedTaskState ────────────────────────────────────────────────

export const DelegatedTaskState = Object.freeze({
  PROPOSED:        'PROPOSED',
  OFFERED:         'OFFERED',
  ACCEPTED:        'ACCEPTED',
  RUNNING:         'RUNNING',
  SUBMITTED:       'SUBMITTED',
  ACCEPTED_RESULT: 'ACCEPTED_RESULT',
  REJECTED_RESULT: 'REJECTED_RESULT',
  CANCELLED:       'CANCELLED',
  FAILED:          'FAILED',
} as const)
export type DelegatedTaskState = typeof DelegatedTaskState[keyof typeof DelegatedTaskState]

export const DelegatedTaskTransitions: Readonly<Record<DelegatedTaskState, ReadonlyArray<DelegatedTaskState>>> = Object.freeze({
  PROPOSED:        ['OFFERED', 'CANCELLED'],
  OFFERED:         ['ACCEPTED', 'REJECTED_RESULT', 'CANCELLED'],
  ACCEPTED:        ['RUNNING', 'CANCELLED'],
  RUNNING:         ['SUBMITTED', 'CANCELLED', 'FAILED'],
  SUBMITTED:       ['ACCEPTED_RESULT', 'REJECTED_RESULT'],
  ACCEPTED_RESULT: [],
  REJECTED_RESULT: [],
  CANCELLED:       [],
  FAILED:          [],
} as const)

export const DelegatedTaskTerminalStates: ReadonlySet<DelegatedTaskState> = new Set([
  DelegatedTaskState.ACCEPTED_RESULT,
  DelegatedTaskState.REJECTED_RESULT,
  DelegatedTaskState.CANCELLED,
  DelegatedTaskState.FAILED,
])

// ── DelegatedTask record ──────────────────────────────────────────────────────

export interface DelegatedTask {
  readonly delegatedTaskId:  DelegatedTaskId
  readonly delegationId:     DelegationId
  readonly delegatorRunId:   AgentRunId
  readonly delegateeRunId:   AgentRunId
  readonly taskId:           AgentTaskId
  readonly description:      string
  readonly state:            DelegatedTaskState
  readonly certificateId?:   CertificateId
  readonly submittedResult?: unknown
  readonly rejectionReason?: string
  readonly createdAt:        Date
  readonly offeredAt?:       Date
  readonly acceptedAt?:      Date
  readonly submittedAt?:     Date
  readonly resolvedAt?:      Date
}

// ── DelegatedTask repository ──────────────────────────────────────────────────

export interface DelegatedTaskRepository {
  save(task: DelegatedTask): Promise<void>
  load(id: DelegatedTaskId): Promise<DelegatedTask | undefined>
}

export class InMemoryDelegatedTaskRepository implements DelegatedTaskRepository {
  private store = new Map<string, DelegatedTask>()
  async save(task: DelegatedTask): Promise<void>                        { this.store.set(task.delegatedTaskId, task) }
  async load(id: DelegatedTaskId): Promise<DelegatedTask | undefined>   { return this.store.get(id) }
}

// ── DelegatedTaskService ──────────────────────────────────────────────────────

export interface ProposeParams {
  readonly delegationId:   DelegationId
  readonly delegatorRunId: AgentRunId
  readonly delegateeRunId: AgentRunId
  readonly taskId:         AgentTaskId
  readonly description:    string
}

export interface TaskOpResult {
  readonly ok:      boolean
  readonly reason?: string
}

export class DelegatedTaskService {
  constructor(
    private readonly certs: CertificateRepository,
    private readonly tasks: DelegatedTaskRepository,
  ) {}

  async propose(params: ProposeParams): Promise<DelegatedTask> {
    const task: DelegatedTask = {
      delegatedTaskId: nextId(`dtask-${params.delegationId}`) as unknown as DelegatedTaskId,
      delegationId:    params.delegationId,
      delegatorRunId:  params.delegatorRunId,
      delegateeRunId:  params.delegateeRunId,
      taskId:          params.taskId,
      description:     params.description,
      state:           DelegatedTaskState.PROPOSED,
      createdAt:       new Date(),
    }
    await this.tasks.save(task)
    return task
  }

  async offer(id: DelegatedTaskId, certId: CertificateId): Promise<TaskOpResult> {
    const task = await this.tasks.load(id)
    if (!task) return { ok: false, reason: 'task-not-found' }

    const cert = await this.certs.load(certId)
    if (!cert)          return { ok: false, reason: 'certificate-not-found' }
    if (cert.revoked)   return { ok: false, reason: 'certificate-revoked' }

    if (!DelegatedTaskTransitions.PROPOSED.includes(DelegatedTaskState.OFFERED)) {
      return { ok: false, reason: `invalid-transition: PROPOSED → OFFERED` }
    }
    await this.tasks.save({ ...task, state: DelegatedTaskState.OFFERED, certificateId: certId, offeredAt: new Date() })
    return { ok: true }
  }

  async accept(id: DelegatedTaskId): Promise<TaskOpResult>  { return this._transition(id, DelegatedTaskState.ACCEPTED,  t => ({ ...t, acceptedAt: new Date() })) }
  async run(id: DelegatedTaskId):    Promise<TaskOpResult>  { return this._transition(id, DelegatedTaskState.RUNNING,   t => t) }

  async submit(id: DelegatedTaskId, result: unknown): Promise<TaskOpResult> {
    return this._transition(id, DelegatedTaskState.SUBMITTED, t => ({ ...t, submittedResult: result, submittedAt: new Date() }))
  }

  async acceptResult(id: DelegatedTaskId): Promise<TaskOpResult> {
    return this._transition(id, DelegatedTaskState.ACCEPTED_RESULT, t => ({ ...t, resolvedAt: new Date() }))
  }

  async rejectResult(id: DelegatedTaskId, reason: string): Promise<TaskOpResult> {
    return this._transition(id, DelegatedTaskState.REJECTED_RESULT, t => ({ ...t, rejectionReason: reason, resolvedAt: new Date() }))
  }

  async cancel(id: DelegatedTaskId, reason: string): Promise<TaskOpResult> {
    return this._transition(id, DelegatedTaskState.CANCELLED, t => ({ ...t, rejectionReason: reason, resolvedAt: new Date() }))
  }

  async fail(id: DelegatedTaskId, reason: string): Promise<TaskOpResult> {
    return this._transition(id, DelegatedTaskState.FAILED, t => ({ ...t, rejectionReason: reason, resolvedAt: new Date() }))
  }

  private async _transition(
    id: DelegatedTaskId,
    toState: DelegatedTaskState,
    patch: (t: DelegatedTask) => Partial<DelegatedTask>,
  ): Promise<TaskOpResult> {
    const task = await this.tasks.load(id)
    if (!task) return { ok: false, reason: 'task-not-found' }

    const allowed = DelegatedTaskTransitions[task.state] as ReadonlyArray<DelegatedTaskState>
    if (!allowed.includes(toState)) {
      return { ok: false, reason: `invalid-transition: ${task.state} → ${toState}` }
    }

    await this.tasks.save({ ...task, ...patch(task), state: toState })
    return { ok: true }
  }
}
