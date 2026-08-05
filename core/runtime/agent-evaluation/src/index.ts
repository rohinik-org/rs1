import type { AgentId, AgentRunId, AgentVersionId } from '@rohinik-org/agent-ir'

// ── Branded IDs ───────────────────────────────────────────────────────────────

declare const _evaluationId:          unique symbol
declare const _reliabilityScoreId:    unique symbol
declare const _policyChangeRequestId: unique symbol

export type EvaluationId          = string & { readonly [_evaluationId]: never }
export type ReliabilityScoreId    = string & { readonly [_reliabilityScoreId]: never }
export type PolicyChangeRequestId = string & { readonly [_policyChangeRequestId]: never }

// ── ID utility ────────────────────────────────────────────────────────────────

let _seq = 0
// ponytail: seq counter for in-memory id uniqueness; replace with UUID generator when persistence requires it
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_seq}`

// ── Task 14: Verdict and Dimension ────────────────────────────────────────────
// Verdicts assess outcome quality — execution success is structurally excluded

export const EvaluationVerdict = Object.freeze({
  PASS:         'PASS',
  FAIL:         'FAIL',
  INCONCLUSIVE: 'INCONCLUSIVE',
} as const)
export type EvaluationVerdict = typeof EvaluationVerdict[keyof typeof EvaluationVerdict]

export const EvaluationDimension = Object.freeze({
  QUALITY:     'QUALITY',
  SAFETY:      'SAFETY',
  RELIABILITY: 'RELIABILITY',
  ALIGNMENT:   'ALIGNMENT',
} as const)
export type EvaluationDimension = typeof EvaluationDimension[keyof typeof EvaluationDimension]

// ── Task 14: Core records ─────────────────────────────────────────────────────

export interface EvaluationEvidence {
  readonly evidenceIds: ReadonlyArray<string>
}

export interface EvaluationRecord {
  readonly evaluationId: EvaluationId
  readonly agentId:      AgentId
  readonly versionId:    AgentVersionId
  readonly runId:        AgentRunId
  readonly dimension:    EvaluationDimension
  readonly verdict:      EvaluationVerdict
  readonly evaluatorId:  string
  readonly notes:        string
  readonly evidenceIds:  ReadonlyArray<string>
  readonly evaluatedAt:  Date
}

// ── Task 14: Repositories ─────────────────────────────────────────────────────

export interface EvaluationRepository {
  save(record: EvaluationRecord): Promise<void>
  loadByRunId(runId: AgentRunId): Promise<EvaluationRecord[]>
  loadByAgentId(agentId: AgentId): Promise<EvaluationRecord[]>
}

export class InMemoryEvaluationRepository implements EvaluationRepository {
  private store = new Map<string, EvaluationRecord>()
  async save(r: EvaluationRecord): Promise<void>                           { this.store.set(r.evaluationId, r) }
  async loadByRunId(runId: AgentRunId): Promise<EvaluationRecord[]>        { return [...this.store.values()].filter(r => r.runId === runId) }
  async loadByAgentId(agentId: AgentId): Promise<EvaluationRecord[]>       { return [...this.store.values()].filter(r => r.agentId === agentId) }
}

// ── Task 14: EvaluationService ────────────────────────────────────────────────

export interface RecordEvaluationParams {
  readonly agentId:     AgentId
  readonly versionId:   AgentVersionId
  readonly runId:       AgentRunId
  readonly dimension:   EvaluationDimension
  readonly verdict:     EvaluationVerdict
  readonly evaluatorId: string
  readonly notes:       string
  readonly evidenceIds: ReadonlyArray<string>
}

export type EvaluationSummary = Partial<Record<EvaluationDimension, Partial<Record<EvaluationVerdict, number>>>>

export class EvaluationService {
  constructor(private readonly repo: EvaluationRepository) {}

  async record(params: RecordEvaluationParams): Promise<EvaluationRecord> {
    const r: EvaluationRecord = {
      evaluationId: nextId('eval') as unknown as EvaluationId,
      agentId:      params.agentId,
      versionId:    params.versionId,
      runId:        params.runId,
      dimension:    params.dimension,
      verdict:      params.verdict,
      evaluatorId:  params.evaluatorId,
      notes:        params.notes,
      evidenceIds:  params.evidenceIds,
      evaluatedAt:  new Date(),
    }
    await this.repo.save(r)
    return r
  }

  summarize(records: ReadonlyArray<EvaluationRecord>): EvaluationSummary {
    const summary: Record<string, Record<string, number>> = {}
    for (const r of records) {
      const dim = summary[r.dimension] ?? (summary[r.dimension] = {})
      dim[r.verdict] = (dim[r.verdict] ?? 0) + 1
    }
    return summary as EvaluationSummary
  }
}

// ── Task 15: ReliabilityScore ─────────────────────────────────────────────────
// Score derives ONLY from evaluation evidence — execution success is excluded structurally

export interface ReliabilityScore {
  readonly scoreId:        ReliabilityScoreId
  readonly agentId:        AgentId
  readonly versionId:      AgentVersionId
  readonly evaluationCount: number
  readonly passRate:       number
  readonly derivedFrom:    'evaluation-evidence'
  readonly computedAt:     Date
}

// ── Task 15: PolicyChangeRequest ──────────────────────────────────────────────
// Change proposal routes through Stage 13 policy layer — never mutates AgentDefinition

export const PolicyChangeStatus = Object.freeze({
  PENDING: 'PENDING',
  ROUTED:  'ROUTED',
  APPLIED: 'APPLIED',
  REJECTED: 'REJECTED',
} as const)
export type PolicyChangeStatus = typeof PolicyChangeStatus[keyof typeof PolicyChangeStatus]

export interface PolicyChangeRequest {
  readonly requestId:      PolicyChangeRequestId
  readonly agentId:        AgentId
  readonly versionId:      AgentVersionId
  readonly rationale:      string
  readonly proposedChange: string
  readonly requestedBy:    string
  readonly status:         PolicyChangeStatus
  readonly requestedAt:    Date
}

// ── Task 15: Repositories ─────────────────────────────────────────────────────

export interface ReliabilityScoreRepository {
  save(score: ReliabilityScore): Promise<void>
  loadByAgentId(agentId: AgentId): Promise<ReliabilityScore[]>
}

export interface PolicyChangeRequestRepository {
  save(request: PolicyChangeRequest): Promise<void>
  load(requestId: PolicyChangeRequestId): Promise<PolicyChangeRequest | undefined>
  loadPending(agentId: AgentId): Promise<PolicyChangeRequest[]>
}

export class InMemoryReliabilityScoreRepository implements ReliabilityScoreRepository {
  private store = new Map<string, ReliabilityScore>()
  async save(s: ReliabilityScore): Promise<void>                            { this.store.set(s.scoreId, s) }
  async loadByAgentId(agentId: AgentId): Promise<ReliabilityScore[]>        { return [...this.store.values()].filter(s => s.agentId === agentId) }
}

export class InMemoryPolicyChangeRequestRepository implements PolicyChangeRequestRepository {
  private store = new Map<string, PolicyChangeRequest>()
  async save(r: PolicyChangeRequest): Promise<void>                                    { this.store.set(r.requestId, r) }
  async load(id: PolicyChangeRequestId): Promise<PolicyChangeRequest | undefined>      { return this.store.get(id) }
  async loadPending(agentId: AgentId): Promise<PolicyChangeRequest[]>                  { return [...this.store.values()].filter(r => r.agentId === agentId && r.status === PolicyChangeStatus.PENDING) }
}

// ── Task 15: ReliabilityService ───────────────────────────────────────────────

export interface RequestPolicyChangeParams {
  readonly agentId:        AgentId
  readonly versionId:      AgentVersionId
  readonly rationale:      string
  readonly proposedChange: string
  readonly requestedBy:    string
}

export class ReliabilityService {
  constructor(
    private readonly scores:  ReliabilityScoreRepository,
    private readonly policy:  PolicyChangeRequestRepository,
  ) {}

  async computeScore(
    agentId:   AgentId,
    versionId: AgentVersionId,
    records:   ReadonlyArray<EvaluationRecord>,
  ): Promise<ReliabilityScore> {
    const total = records.length
    const passed = records.filter(r => r.verdict === EvaluationVerdict.PASS).length
    const score: ReliabilityScore = {
      scoreId:          nextId('rscore') as unknown as ReliabilityScoreId,
      agentId,
      versionId,
      evaluationCount:  total,
      passRate:         total === 0 ? 0 : passed / total,
      derivedFrom:      'evaluation-evidence',
      computedAt:       new Date(),
    }
    await this.scores.save(score)
    return score
  }

  async requestPolicyChange(params: RequestPolicyChangeParams): Promise<PolicyChangeRequest> {
    const request: PolicyChangeRequest = {
      requestId:      nextId('pcreq') as unknown as PolicyChangeRequestId,
      agentId:        params.agentId,
      versionId:      params.versionId,
      rationale:      params.rationale,
      proposedChange: params.proposedChange,
      requestedBy:    params.requestedBy,
      status:         PolicyChangeStatus.PENDING,
      requestedAt:    new Date(),
    }
    await this.policy.save(request)
    return request
  }
}
