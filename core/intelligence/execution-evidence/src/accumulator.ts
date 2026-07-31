import type {
  ExecutionEvidenceId,
  IntelligentExecutionId,
  ExecutionSessionId,
  TraceId,
  SpanId,
  InvocationId,
  RetryId,
  FallbackId,
  ContentHash,
  ContextAdmissionReference,
  CapabilityBindingReference,
  RoutingDecisionReference,
  PolicyDecisionReference,
  TokenUsageObservation,
  CostObservation,
  EvidenceOutcome,
} from '@rohinik-org/execution-evidence-ir'
import { EvidenceCompletionState, EvidenceErrorCode } from '@rohinik-org/execution-evidence-ir'

export interface AccumulatorParams {
  readonly evidenceId:             ExecutionEvidenceId
  readonly intelligentExecutionId: IntelligentExecutionId
  readonly executionSessionId:     ExecutionSessionId
  readonly operationKind:          string
  readonly startedAt:              Date
  readonly traceId?:               TraceId
  readonly spanId?:                SpanId
}

export class ExecutionAccumulator {
  readonly evidenceId:             ExecutionEvidenceId
  readonly intelligentExecutionId: IntelligentExecutionId
  readonly executionSessionId:     ExecutionSessionId
  readonly operationKind:          string
  readonly startedAt:              Date
  readonly traceId?:               TraceId
  readonly spanId?:                SpanId

  private _state:            EvidenceCompletionState = EvidenceCompletionState.OPEN
  private _outcome:          EvidenceOutcome | undefined
  private _completedAt:      Date | undefined
  private _inputHash:        ContentHash | undefined
  private _outputHash:       ContentHash | undefined
  private _invocationIds:    Set<string> = new Set()
  private _retryIds:         Set<string> = new Set()
  private _fallbackIds:      Set<string> = new Set()
  private _tokenUsage:       TokenUsageObservation | undefined
  private _cost:             CostObservation | undefined
  private _contextRef:       ContextAdmissionReference | undefined
  private _capabilityRef:    CapabilityBindingReference | undefined
  private _routingRef:       RoutingDecisionReference | undefined
  private _policyRef:        PolicyDecisionReference | undefined
  private _privacyBoundary:  boolean | undefined

  private constructor(params: AccumulatorParams) {
    this.evidenceId             = params.evidenceId
    this.intelligentExecutionId = params.intelligentExecutionId
    this.executionSessionId     = params.executionSessionId
    this.operationKind          = params.operationKind
    this.startedAt              = params.startedAt
    if (params.traceId) this.traceId = params.traceId
    if (params.spanId)  this.spanId  = params.spanId
  }

  static open(params: AccumulatorParams): ExecutionAccumulator {
    return new ExecutionAccumulator(params)
  }

  get completionState(): EvidenceCompletionState { return this._state }
  get outcome():         EvidenceOutcome | undefined { return this._outcome }
  get completedAt():     Date | undefined { return this._completedAt }
  get inputHash():       ContentHash | undefined { return this._inputHash }
  get outputHash():      ContentHash | undefined { return this._outputHash }
  get retryCount():      number { return this._retryIds.size }
  get fallbackCount():   number { return this._fallbackIds.size }
  get invocationIds():   readonly string[] { return [...this._invocationIds] }
  get tokenUsage():      TokenUsageObservation | undefined { return this._tokenUsage }
  get cost():            CostObservation | undefined { return this._cost }
  get contextRef():      ContextAdmissionReference | undefined { return this._contextRef }
  get capabilityRef():   CapabilityBindingReference | undefined { return this._capabilityRef }
  get routingRef():      RoutingDecisionReference | undefined { return this._routingRef }
  get policyRef():       PolicyDecisionReference | undefined { return this._policyRef }
  get privacyBoundary(): boolean | undefined { return this._privacyBoundary }

  private assertOpen(): void {
    if (this._state !== EvidenceCompletionState.OPEN) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_SEAL_FAILED}: cannot mutate a sealed accumulator`)
    }
  }

  appendInvocation(id: InvocationId): void {
    this.assertOpen()
    if (this._invocationIds.has(id)) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_DUPLICATE_EVENT}: duplicate invocation ID '${id}'`)
    }
    this._invocationIds.add(id)
  }

  appendRetry(id: RetryId): void {
    this.assertOpen()
    if (this._retryIds.has(id)) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_DUPLICATE_EVENT}: duplicate retry ID '${id}'`)
    }
    this._retryIds.add(id)
  }

  appendFallback(id: FallbackId): void {
    this.assertOpen()
    if (this._fallbackIds.has(id)) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_DUPLICATE_EVENT}: duplicate fallback ID '${id}'`)
    }
    this._fallbackIds.add(id)
  }

  setOutcome(outcome: EvidenceOutcome): void {
    this.assertOpen()
    if (this._outcome !== undefined) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_SEAL_FAILED}: outcome already set`)
    }
    this._outcome = outcome
  }

  setInputHash(hash: ContentHash): void {
    this.assertOpen()
    this._inputHash = hash
  }

  setOutputHash(hash: ContentHash): void {
    this.assertOpen()
    this._outputHash = hash
  }

  setTokenUsage(usage: TokenUsageObservation): void {
    this.assertOpen()
    this._tokenUsage = usage
  }

  setCost(cost: CostObservation): void {
    this.assertOpen()
    this._cost = cost
  }

  setContextAdmissionRef(ref: ContextAdmissionReference): void {
    this.assertOpen()
    this._contextRef = ref
  }

  setCapabilityBindingRef(ref: CapabilityBindingReference): void {
    this.assertOpen()
    this._capabilityRef = ref
  }

  setRoutingDecisionRef(ref: RoutingDecisionReference): void {
    this.assertOpen()
    this._routingRef = ref
  }

  setPolicyDecisionRef(ref: PolicyDecisionReference): void {
    this.assertOpen()
    this._policyRef = ref
  }

  setPrivacyBoundaryPreserved(preserved: boolean): void {
    this.assertOpen()
    this._privacyBoundary = preserved
  }

  seal(completedAt: Date): void {
    this.assertOpen()
    if (this._outcome === undefined) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_MISSING_REQUIRED_FIELD}: outcome must be set before sealing`)
    }
    if (completedAt < this.startedAt) {
      throw new Error(`${EvidenceErrorCode.EVIDENCE_SEAL_FAILED}: completedAt cannot precede startedAt`)
    }
    this._completedAt = completedAt
    this._state       = EvidenceCompletionState.SEALED
  }
}
