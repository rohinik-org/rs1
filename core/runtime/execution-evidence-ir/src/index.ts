// ── Branded ID types ──────────────────────────────────────────────────────────
declare const _brand: unique symbol
type Brand<T, B> = T & { readonly [_brand]: B }

export type IntelligentExecutionId = Brand<string, 'IntelligentExecutionId'>
export type ExecutionEvidenceId    = Brand<string, 'ExecutionEvidenceId'>
export type ExecutionSessionId     = Brand<string, 'ExecutionSessionId'>
export type TraceId                = Brand<string, 'TraceId'>
export type SpanId                 = Brand<string, 'SpanId'>
export type InvocationId           = Brand<string, 'InvocationId'>
export type SelectionId            = Brand<string, 'SelectionId'>
export type RetryId                = Brand<string, 'RetryId'>
export type FallbackId             = Brand<string, 'FallbackId'>
export type ValidationId           = Brand<string, 'ValidationId'>
export type ContentHash            = Brand<string, 'ContentHash'>

function requireNonEmpty(value: string, label: string): void {
  if (!value) throw new Error(`${label} must be a non-empty string`)
}

export function intelligentExecutionId(v: string): IntelligentExecutionId {
  requireNonEmpty(v, 'IntelligentExecutionId')
  return v as IntelligentExecutionId
}
export function executionEvidenceId(v: string): ExecutionEvidenceId {
  requireNonEmpty(v, 'ExecutionEvidenceId')
  return v as ExecutionEvidenceId
}
export function executionSessionId(v: string): ExecutionSessionId {
  requireNonEmpty(v, 'ExecutionSessionId')
  return v as ExecutionSessionId
}
export function traceId(v: string): TraceId {
  requireNonEmpty(v, 'TraceId')
  return v as TraceId
}
export function spanId(v: string): SpanId {
  requireNonEmpty(v, 'SpanId')
  return v as SpanId
}
export function invocationId(v: string): InvocationId {
  requireNonEmpty(v, 'InvocationId')
  return v as InvocationId
}
export function selectionId(v: string): SelectionId {
  requireNonEmpty(v, 'SelectionId')
  return v as SelectionId
}
export function retryId(v: string): RetryId {
  requireNonEmpty(v, 'RetryId')
  return v as RetryId
}
export function fallbackId(v: string): FallbackId {
  requireNonEmpty(v, 'FallbackId')
  return v as FallbackId
}
export function validationId(v: string): ValidationId {
  requireNonEmpty(v, 'ValidationId')
  return v as ValidationId
}
export function contentHash(v: string): ContentHash {
  requireNonEmpty(v, 'ContentHash')
  return v as ContentHash
}

// ── Schema and canonicalization versions ─────────────────────────────────────

export const EvidenceSchemaVersion    = '1.0.0' as const
export const CANONICALIZATION_VERSION = '1' as const

// ── Completion state ──────────────────────────────────────────────────────────

export const EvidenceCompletionState = Object.freeze({
  OPEN:   'open',
  SEALED: 'sealed',
} as const)
export type EvidenceCompletionState = typeof EvidenceCompletionState[keyof typeof EvidenceCompletionState]

// ── Integrity status ──────────────────────────────────────────────────────────

export const EvidenceIntegrityStatus = Object.freeze({
  VALID:            'valid',
  INTEGRITY_FAILED: 'integrity_failed',
  NOT_FOUND:        'not_found',
} as const)
export type EvidenceIntegrityStatus = typeof EvidenceIntegrityStatus[keyof typeof EvidenceIntegrityStatus]

// ── Error codes ───────────────────────────────────────────────────────────────

export const EvidenceErrorCode = Object.freeze({
  EVIDENCE_SEAL_FAILED:            'EVIDENCE_SEAL_FAILED',
  EVIDENCE_PERSISTENCE_FAILED:     'EVIDENCE_PERSISTENCE_FAILED',
  EVIDENCE_INTEGRITY_FAILED:       'EVIDENCE_INTEGRITY_FAILED',
  EVIDENCE_NOT_FOUND:              'EVIDENCE_NOT_FOUND',
  EVIDENCE_DUPLICATE_EVENT:        'EVIDENCE_DUPLICATE_EVENT',
  EVIDENCE_MISSING_REQUIRED_FIELD: 'EVIDENCE_MISSING_REQUIRED_FIELD',
  EVIDENCE_CONFLICTING_REWRITE:    'EVIDENCE_CONFLICTING_REWRITE',
} as const)
export type EvidenceErrorCode = typeof EvidenceErrorCode[keyof typeof EvidenceErrorCode]

// ── Event types ───────────────────────────────────────────────────────────────

export const EvidenceEventType = Object.freeze({
  EVIDENCE_OPENED:                       'evidence.opened',
  EVIDENCE_OBSERVATION_APPENDED:         'evidence.observation_appended',
  EVIDENCE_SEAL_STARTED:                 'evidence.seal_started',
  EVIDENCE_SEALED:                       'evidence.sealed',
  EVIDENCE_REPOSITORY_ACCEPTED:          'evidence.repository_accepted',
  EVIDENCE_INTEGRITY_VERIFICATION_FAILED:'evidence.integrity_verification_failed',
  EVIDENCE_REDACTED_VIEW_PRODUCED:       'evidence.redacted_view_produced',
  EVIDENCE_PERSISTENCE_FAILED:           'evidence.persistence_failed',
} as const)
export type EvidenceEventType = typeof EvidenceEventType[keyof typeof EvidenceEventType]

// ── Opaque cross-domain references ───────────────────────────────────────────
// Stage 11E does not depend on Stage 11D, 11F–11K, or 9J implementation types.
// These are opaque structurally-compatible references that carry hash and ID only.

export interface ContextAdmissionReference {
  readonly kind:            'context-admission'
  readonly contractId:      string
  readonly admissionHash:   string
  readonly contextFree:     boolean
}

export interface CapabilityBindingReference {
  readonly kind:            'capability-binding'
  readonly capabilityId:    string
  readonly providerId:      string
  readonly bindingHash:     string
}

export interface RoutingDecisionReference {
  readonly kind:            'routing-decision'
  readonly decisionId:      string
  readonly decisionHash:    string
}

export interface PolicyDecisionReference {
  readonly kind:            'policy-decision'
  readonly policyRef:       string  // opaque until Stage 11K
  readonly decisionHash:    string
}

export interface EvaluationReference {
  readonly kind:            'evaluation'
  readonly evaluationId:    string
  readonly evaluationHash:  string
}

export interface ActivationReference {
  readonly kind:            'activation'
  readonly activationId:    string
  readonly activationHash:  string
}

export function makeContextAdmissionRef(contractId: string, admissionHash: string, contextFree: boolean): ContextAdmissionReference {
  return { kind: 'context-admission', contractId, admissionHash, contextFree }
}
export function makeCapabilityBindingRef(capabilityId: string, providerId: string, bindingHash: string): CapabilityBindingReference {
  return { kind: 'capability-binding', capabilityId, providerId, bindingHash }
}
export function makeRoutingDecisionRef(decisionId: string, decisionHash: string): RoutingDecisionReference {
  return { kind: 'routing-decision', decisionId, decisionHash }
}
export function makePolicyDecisionRef(policyRef: string, decisionHash: string): PolicyDecisionReference {
  return { kind: 'policy-decision', policyRef, decisionHash }
}
export function makeEvaluationRef(evaluationId: string, evaluationHash: string): EvaluationReference {
  return { kind: 'evaluation', evaluationId, evaluationHash }
}
export function makeActivationRef(activationId: string, activationHash: string): ActivationReference {
  return { kind: 'activation', activationId, activationHash }
}

// ── Usage and cost ────────────────────────────────────────────────────────────

export interface TokenUsageObservation {
  readonly inputTokens?:        number  // finite, non-negative
  readonly outputTokens?:       number
  readonly totalTokens?:        number
  readonly cachedInputTokens?:  number
}

export interface CostObservation {
  readonly estimatedCost:    number
  readonly currency:         string   // required with cost
  readonly confidence:       number   // 0–1, required with estimated cost
  readonly observedCost?:    number   // distinct from estimated
}

// ── Evidence outcome ──────────────────────────────────────────────────────────

export const EvidenceOutcome = Object.freeze({
  SUCCESS:      'success',
  FAILURE:      'failure',
  TIMEOUT:      'timeout',
  CANCELLED:    'cancelled',
  ABORTED:      'aborted',
} as const)
export type EvidenceOutcome = typeof EvidenceOutcome[keyof typeof EvidenceOutcome]

// ── Supersession reference ────────────────────────────────────────────────────

export interface SupersessionReference {
  readonly supersedesEvidenceId:   ExecutionEvidenceId
  readonly supersedesEvidenceHash: string
  readonly correctionReason:       string
}

// ── Sealed execution evidence record ─────────────────────────────────────────

export interface SealedExecutionEvidence {
  readonly evidenceId:              ExecutionEvidenceId
  readonly schemaVersion:           string
  readonly canonicalizationVersion: string
  readonly completionState:         typeof EvidenceCompletionState.SEALED
  readonly intelligentExecutionId:  IntelligentExecutionId
  readonly executionSessionId:      ExecutionSessionId
  readonly traceId?:                TraceId
  readonly spanId?:                 SpanId
  readonly operationKind:           string
  readonly startedAt:               Date
  readonly completedAt:             Date
  readonly outcome:                 EvidenceOutcome
  readonly errorCode?:              EvidenceErrorCode
  readonly contextAdmissionRef?:    ContextAdmissionReference
  readonly capabilityBindingRef?:   CapabilityBindingReference
  readonly routingDecisionRef?:     RoutingDecisionReference
  readonly policyDecisionRef?:      PolicyDecisionReference
  readonly evaluationRef?:          EvaluationReference
  readonly activationRef?:          ActivationReference
  readonly inputHash?:              ContentHash
  readonly outputHash?:             ContentHash
  readonly tokenUsage?:             TokenUsageObservation
  readonly cost?:                   CostObservation
  readonly retryCount:              number
  readonly fallbackCount:           number
  readonly privacyBoundaryPreserved?: boolean
  readonly supersedes?:             SupersessionReference
  readonly evidenceHash:            string  // content hash, excluded from its own computation
  readonly producedAt:              Date    // repository metadata, excluded from content hash
}

// ── Dependency injection interfaces ──────────────────────────────────────────

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  generate(): string
}

export interface ContentHasher {
  hash(canonical: string): string
}

// ── Repository integrity verification result ──────────────────────────────────

export interface EvidenceIntegrityVerification {
  readonly evidenceId: ExecutionEvidenceId
  readonly status:     EvidenceIntegrityStatus
  readonly checkedAt:  Date
}

// ── Service and repository interfaces ────────────────────────────────────────

export interface ExecutionEvidenceRepository {
  store(record: SealedExecutionEvidence): Promise<void>
  findById(id: ExecutionEvidenceId): Promise<SealedExecutionEvidence | undefined>
  verifyIntegrity(id: ExecutionEvidenceId): Promise<EvidenceIntegrityVerification>
}

export interface ExecutionEvidenceService {
  open(params: {
    intelligentExecutionId: IntelligentExecutionId
    executionSessionId:     ExecutionSessionId
    operationKind:          string
    startedAt:              Date
    traceId?:               TraceId
    spanId?:                SpanId
  }): ExecutionEvidenceId

  recordContextAdmission(evidenceId: ExecutionEvidenceId, ref: ContextAdmissionReference): void
  recordCapabilityBinding(evidenceId: ExecutionEvidenceId, ref: CapabilityBindingReference): void
  recordRoutingDecision(evidenceId: ExecutionEvidenceId, ref: RoutingDecisionReference): void
  recordPolicyDecision(evidenceId: ExecutionEvidenceId, ref: PolicyDecisionReference): void
  recordTokenUsage(evidenceId: ExecutionEvidenceId, usage: TokenUsageObservation): void
  recordCost(evidenceId: ExecutionEvidenceId, cost: CostObservation): void
  recordInputHash(evidenceId: ExecutionEvidenceId, hash: ContentHash): void
  recordOutputHash(evidenceId: ExecutionEvidenceId, hash: ContentHash): void
  recordRetry(evidenceId: ExecutionEvidenceId, retryRef: RetryId): void
  recordFallback(evidenceId: ExecutionEvidenceId, fallbackRef: FallbackId): void
  recordPrivacyBoundary(evidenceId: ExecutionEvidenceId, preserved: boolean): void

  sealAndStore(evidenceId: ExecutionEvidenceId, outcome: EvidenceOutcome, completedAt: Date): Promise<SealedExecutionEvidence>
}

export { computeEvidenceHash, verifyEvidenceHash } from './hash.js'

// ── Redacted evidence view ────────────────────────────────────────────────────

export type ViewId = Brand<string, 'ViewId'>
export function viewId(v: string): ViewId {
  requireNonEmpty(v, 'ViewId')
  return v as ViewId
}

export interface RedactionPolicyReference {
  readonly kind:       'redaction-policy'
  readonly policyId:   string
  readonly policyHash: string
}

export type RedactableField = keyof Pick<SealedExecutionEvidence,
  | 'traceId' | 'spanId' | 'contextAdmissionRef' | 'capabilityBindingRef'
  | 'routingDecisionRef' | 'policyDecisionRef' | 'evaluationRef' | 'activationRef'
  | 'inputHash' | 'outputHash' | 'tokenUsage' | 'cost'
  | 'privacyBoundaryPreserved' | 'supersedes' | 'operationKind'
>

export interface RedactedExecutionEvidenceView {
  readonly viewId:              ViewId
  readonly sourceEvidenceId:    ExecutionEvidenceId
  readonly sourceEvidenceHash:  string
  readonly redactionPolicy:     RedactionPolicyReference
  readonly redactedFields:      readonly RedactableField[]
  readonly projection:          Readonly<Partial<Omit<SealedExecutionEvidence, 'evidenceHash'>>>
  readonly viewHash:            string
  readonly producedAt:          Date
}
