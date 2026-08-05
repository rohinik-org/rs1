import type { AgentRunId } from '@rohinik-org/agent-ir'

// ── Branded IDs ───────────────────────────────────────────────────────────────

declare const _oversightRequestId:  unique symbol
declare const _oversightDecisionId: unique symbol
declare const _safetyStopId:        unique symbol
declare const _incidentRecordId:    unique symbol
declare const _cancellationPropagationId: unique symbol
declare const _communicationCutoffId:     unique symbol

export type OversightRequestId         = string & { readonly [_oversightRequestId]: never }
export type OversightDecisionId        = string & { readonly [_oversightDecisionId]: never }
export type SafetyStopId               = string & { readonly [_safetyStopId]: never }
export type IncidentRecordId           = string & { readonly [_incidentRecordId]: never }
export type CancellationPropagationId  = string & { readonly [_cancellationPropagationId]: never }
export type CommunicationCutoffId      = string & { readonly [_communicationCutoffId]: never }

// ── ID utility ────────────────────────────────────────────────────────────────

let _seq = 0
// ponytail: seq counter for in-memory id uniqueness; replace with UUID generator when persistence requires it
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_seq}`

// ── Task 12: Operator identity ────────────────────────────────────────────────

export interface OversightOperator {
  readonly operatorId: string
  readonly name:       string
  readonly role:       string
}

// ── Task 12: Decision kinds — observation is not control ──────────────────────
// Every value is an active intervention. No READ/OBSERVE/MONITOR.

export const OversightDecisionKind = Object.freeze({
  APPROVE:    'APPROVE',
  DENY:       'DENY',
  PAUSE:      'PAUSE',
  CONSTRAIN:  'CONSTRAIN',
  RESUME:     'RESUME',
  CANCEL:     'CANCEL',
  TERMINATE:  'TERMINATE',
} as const)
export type OversightDecisionKind = typeof OversightDecisionKind[keyof typeof OversightDecisionKind]

// ── Task 12: Request states ───────────────────────────────────────────────────

export const OversightRequestState = Object.freeze({
  PENDING: 'PENDING',
  DECIDED: 'DECIDED',
} as const)
export type OversightRequestState = typeof OversightRequestState[keyof typeof OversightRequestState]

// ── Task 12: ConstraintDirective ──────────────────────────────────────────────

export interface ConstraintDirective {
  readonly removeCapabilities?:  ReadonlyArray<string>
  readonly addDeniedActions?:    ReadonlyArray<string>
  readonly maxCostUsdOverride?:  number
}

// ── Task 12: Core records ─────────────────────────────────────────────────────

export interface OversightRequest {
  readonly requestId:  OversightRequestId
  readonly runId:      AgentRunId
  readonly reason:     string
  readonly context:    unknown
  readonly state:      OversightRequestState
  readonly enqueuedAt: Date
}

export interface OversightDecision {
  readonly decisionId:         OversightDecisionId
  readonly requestId:          OversightRequestId
  readonly runId:              AgentRunId
  readonly kind:               OversightDecisionKind
  readonly operatorId:         string
  readonly rationale:          string
  readonly decidedAt:          Date
  readonly constraintDirective?: ConstraintDirective
}

export interface ReviewQueueItem {
  readonly requestId:  OversightRequestId
  readonly runId:      AgentRunId
  readonly reason:     string
  readonly enqueuedAt: Date
}

// ── Task 12: Repositories ─────────────────────────────────────────────────────

export interface ReviewQueue {
  enqueue(item: ReviewQueueItem): Promise<void>
  peek(): Promise<ReadonlyArray<ReviewQueueItem>>
  remove(requestId: OversightRequestId): Promise<void>
}

export interface OversightRequestRepository {
  save(request: OversightRequest): Promise<void>
  load(requestId: OversightRequestId): Promise<OversightRequest | undefined>
}

export interface OversightDecisionRepository {
  save(decision: OversightDecision): Promise<void>
  load(decisionId: OversightDecisionId): Promise<OversightDecision | undefined>
  loadByRunId(runId: AgentRunId): Promise<OversightDecision[]>
}

export class InMemoryReviewQueue implements ReviewQueue {
  private items: ReviewQueueItem[] = []
  async enqueue(item: ReviewQueueItem): Promise<void>                              { this.items.push(item) }
  async peek(): Promise<ReadonlyArray<ReviewQueueItem>>                            { return [...this.items] }
  async remove(requestId: OversightRequestId): Promise<void>                       { this.items = this.items.filter(i => i.requestId !== requestId) }
}

export class InMemoryOversightRequestRepository implements OversightRequestRepository {
  private store = new Map<string, OversightRequest>()
  async save(req: OversightRequest): Promise<void>                                 { this.store.set(req.requestId, req) }
  async load(id: OversightRequestId): Promise<OversightRequest | undefined>       { return this.store.get(id) }
}

export class InMemoryOversightDecisionRepository implements OversightDecisionRepository {
  private store = new Map<string, OversightDecision>()
  async save(d: OversightDecision): Promise<void>                                  { this.store.set(d.decisionId, d) }
  async load(id: OversightDecisionId): Promise<OversightDecision | undefined>     { return this.store.get(id) }
  async loadByRunId(runId: AgentRunId): Promise<OversightDecision[]>              { return [...this.store.values()].filter(d => d.runId === runId) }
}

// ── Task 12: OversightService ─────────────────────────────────────────────────

export interface EnqueueParams {
  readonly runId:   AgentRunId
  readonly reason:  string
  readonly context: unknown
}

export class OversightService {
  constructor(
    private readonly queue:    ReviewQueue,
    private readonly requests: OversightRequestRepository,
    private readonly decisions: OversightDecisionRepository,
  ) {}

  async enqueue(params: EnqueueParams): Promise<OversightRequest> {
    const requestId = nextId('oreq') as unknown as OversightRequestId
    const req: OversightRequest = {
      requestId,
      runId:      params.runId,
      reason:     params.reason,
      context:    params.context,
      state:      OversightRequestState.PENDING,
      enqueuedAt: new Date(),
    }
    await this.requests.save(req)
    await this.queue.enqueue({ requestId, runId: params.runId, reason: params.reason, enqueuedAt: req.enqueuedAt })
    return req
  }

  async approve(requestId: OversightRequestId, operator: OversightOperator, rationale: string): Promise<OversightDecision> {
    return this._decide(requestId, operator, OversightDecisionKind.APPROVE, rationale)
  }

  async deny(requestId: OversightRequestId, operator: OversightOperator, rationale: string): Promise<OversightDecision> {
    return this._decide(requestId, operator, OversightDecisionKind.DENY, rationale)
  }

  async pause(requestId: OversightRequestId, operator: OversightOperator, rationale: string): Promise<OversightDecision> {
    return this._decide(requestId, operator, OversightDecisionKind.PAUSE, rationale)
  }

  async constrain(requestId: OversightRequestId, operator: OversightOperator, directive: ConstraintDirective, rationale: string): Promise<OversightDecision> {
    return this._decide(requestId, operator, OversightDecisionKind.CONSTRAIN, rationale, directive)
  }

  async resume(requestId: OversightRequestId, operator: OversightOperator, rationale: string): Promise<OversightDecision> {
    return this._decide(requestId, operator, OversightDecisionKind.RESUME, rationale)
  }

  async cancel(requestId: OversightRequestId, operator: OversightOperator, rationale: string): Promise<OversightDecision> {
    return this._decide(requestId, operator, OversightDecisionKind.CANCEL, rationale)
  }

  async terminate(requestId: OversightRequestId, operator: OversightOperator, rationale: string): Promise<OversightDecision> {
    return this._decide(requestId, operator, OversightDecisionKind.TERMINATE, rationale)
  }

  private async _decide(
    requestId: OversightRequestId,
    operator: OversightOperator,
    kind: OversightDecisionKind,
    rationale: string,
    constraintDirective?: ConstraintDirective,
  ): Promise<OversightDecision> {
    const req = await this.requests.load(requestId)
    if (!req) throw new Error('request-not-found')
    if (req.state === OversightRequestState.DECIDED) throw new Error('already-decided')

    const decision: OversightDecision = {
      decisionId:  nextId('odec') as unknown as OversightDecisionId,
      requestId,
      runId:       req.runId,
      kind,
      operatorId:  operator.operatorId,
      rationale,
      decidedAt:   new Date(),
      ...(constraintDirective !== undefined && { constraintDirective }),
    }
    await this.decisions.save(decision)
    await this.requests.save({ ...req, state: OversightRequestState.DECIDED })
    await this.queue.remove(requestId)
    return decision
  }
}

// ── Task 13: SafetyStop severity ──────────────────────────────────────────────

export const SafetyStopSeverity = Object.freeze({
  WARNING:   'WARNING',
  CRITICAL:  'CRITICAL',
  EMERGENCY: 'EMERGENCY',
} as const)
export type SafetyStopSeverity = typeof SafetyStopSeverity[keyof typeof SafetyStopSeverity]

// ── Task 13: Core records ─────────────────────────────────────────────────────

export interface SafetyStop {
  readonly safetyStopId:       SafetyStopId
  readonly runId:              AgentRunId
  readonly operatorId:         string
  readonly reason:             string
  readonly severity:           SafetyStopSeverity
  readonly requiresReAdmission: boolean
  readonly stoppedAt:          Date
}

export interface CancellationPropagation {
  readonly propagationId:    CancellationPropagationId
  readonly originStopId:     SafetyStopId
  readonly cancelledRunIds:  ReadonlyArray<AgentRunId>
  readonly propagatedAt:     Date
}

export interface CommunicationCutoff {
  readonly cutoffId:      CommunicationCutoffId
  readonly safetyStopId:  SafetyStopId
  readonly runId:         AgentRunId
  readonly cutoffAt:      Date
}

export interface IncidentRecord {
  readonly incidentId:    IncidentRecordId
  readonly safetyStopId:  SafetyStopId
  readonly runId:         AgentRunId
  readonly summary:       string
  readonly evidenceIds:   ReadonlyArray<string>
  readonly recordedAt:    Date
}

// ── Task 13: Repositories ─────────────────────────────────────────────────────

export interface SafetyStopRepository {
  save(stop: SafetyStop): Promise<void>
  load(id: SafetyStopId): Promise<SafetyStop | undefined>
  loadByRunId(runId: AgentRunId): Promise<SafetyStop[]>
}

export interface IncidentRepository {
  save(incident: IncidentRecord): Promise<void>
  loadByRunId(runId: AgentRunId): Promise<IncidentRecord[]>
}

export interface CommunicationCutoffRepository {
  save(cutoff: CommunicationCutoff): Promise<void>
  isActive(runId: AgentRunId): Promise<boolean>
}

export interface CancellationPropagationRepository {
  save(propagation: CancellationPropagation): Promise<void>
  loadByStop(stopId: SafetyStopId): Promise<CancellationPropagation[]>
}

export class InMemorySafetyStopRepository implements SafetyStopRepository {
  private store = new Map<string, SafetyStop>()
  async save(stop: SafetyStop): Promise<void>                              { this.store.set(stop.safetyStopId, stop) }
  async load(id: SafetyStopId): Promise<SafetyStop | undefined>           { return this.store.get(id) }
  async loadByRunId(runId: AgentRunId): Promise<SafetyStop[]>             { return [...this.store.values()].filter(s => s.runId === runId) }
}

export class InMemoryIncidentRepository implements IncidentRepository {
  private store = new Map<string, IncidentRecord>()
  async save(incident: IncidentRecord): Promise<void>                     { this.store.set(incident.incidentId, incident) }
  async loadByRunId(runId: AgentRunId): Promise<IncidentRecord[]>         { return [...this.store.values()].filter(i => i.runId === runId) }
}

export class InMemoryCommunicationCutoffRepository implements CommunicationCutoffRepository {
  private store = new Map<string, CommunicationCutoff>()
  async save(cutoff: CommunicationCutoff): Promise<void>                  { this.store.set(cutoff.runId, cutoff) }
  async isActive(runId: AgentRunId): Promise<boolean>                     { return this.store.has(runId) }
}

export class InMemoryCancellationPropagationRepository implements CancellationPropagationRepository {
  private store = new Map<string, CancellationPropagation>()
  async save(p: CancellationPropagation): Promise<void>                   { this.store.set(p.propagationId, p) }
  async loadByStop(stopId: SafetyStopId): Promise<CancellationPropagation[]> {
    return [...this.store.values()].filter(p => p.originStopId === stopId)
  }
}

// ── Task 13: ContainmentService ───────────────────────────────────────────────

export interface StopParams {
  readonly runId:    AgentRunId
  readonly operator: OversightOperator
  readonly reason:   string
  readonly severity: SafetyStopSeverity
}

export interface RecordIncidentParams {
  readonly safetyStopId: SafetyStopId
  readonly runId:        AgentRunId
  readonly summary:      string
  readonly evidenceIds:  ReadonlyArray<string>
}

export class ContainmentService {
  constructor(
    private readonly stops:        SafetyStopRepository,
    private readonly incidents:    IncidentRepository,
    private readonly cutoffs:      CommunicationCutoffRepository,
    private readonly propagations: CancellationPropagationRepository,
  ) {}

  async stop(params: StopParams): Promise<SafetyStop> {
    // CRITICAL and EMERGENCY always require re-admission; WARNING does not
    const requiresReAdmission = params.severity !== SafetyStopSeverity.WARNING
    const safetyStop: SafetyStop = {
      safetyStopId:        nextId('stop') as unknown as SafetyStopId,
      runId:               params.runId,
      operatorId:          params.operator.operatorId,
      reason:              params.reason,
      severity:            params.severity,
      requiresReAdmission,
      stoppedAt:           new Date(),
    }
    await this.stops.save(safetyStop)
    return safetyStop
  }

  async propagate(stopId: SafetyStopId, cancelledRunIds: ReadonlyArray<AgentRunId>): Promise<CancellationPropagation> {
    const stop = await this.stops.load(stopId)
    if (!stop) throw new Error('stop-not-found')
    const propagation: CancellationPropagation = {
      propagationId:   nextId('prop') as unknown as CancellationPropagationId,
      originStopId:    stopId,
      cancelledRunIds,
      propagatedAt:    new Date(),
    }
    await this.propagations.save(propagation)
    return propagation
  }

  async cutoff(stopId: SafetyStopId, runId: AgentRunId): Promise<CommunicationCutoff> {
    const cutoff: CommunicationCutoff = {
      cutoffId:     nextId('cutoff') as unknown as CommunicationCutoffId,
      safetyStopId: stopId,
      runId,
      cutoffAt:     new Date(),
    }
    await this.cutoffs.save(cutoff)
    return cutoff
  }

  async isCutOff(runId: AgentRunId): Promise<boolean> {
    return this.cutoffs.isActive(runId)
  }

  async recordIncident(params: RecordIncidentParams): Promise<IncidentRecord> {
    const incident: IncidentRecord = {
      incidentId:   nextId('incident') as unknown as IncidentRecordId,
      safetyStopId: params.safetyStopId,
      runId:        params.runId,
      summary:      params.summary,
      evidenceIds:  params.evidenceIds,
      recordedAt:   new Date(),
    }
    await this.incidents.save(incident)
    return incident
  }
}
