import { createHash } from 'node:crypto'

// ── Constitutional laws (L-11D-001 through L-11D-008) ─────────────────────────
// Law 66 (L-11D-001): No intelligence provider invocation without explicit admission manifest.
// Law 67 (L-11D-002): Retrieval rank alone must not establish authority.
// Law 68 (L-11D-003): Admitted package must not contain unsatisfied mandatory requirements.
// Law 69 (L-11D-004): Failed hard safety rule overrides composite quality score.
// Law 70 (L-11D-005): Every admitted derived representation preserves provenance chain.
// Law 71 (L-11D-006): Context correction attempts bounded by count, latency, cost.
// Law 72 (L-11D-007): Context deficiency never silently converted to normal admission.
// Law 73 (L-11D-008): Package evaluated for admission is identical to package delivered to consumer.

// ── Branded ID types ──────────────────────────────────────────────────────────
export type ContextContractId      = string & { readonly _brand: 'ContextContractId' }
export type ContextPackageId       = string & { readonly _brand: 'ContextPackageId' }
export type ContextItemId          = string & { readonly _brand: 'ContextItemId' }
export type ContextManifestId      = string & { readonly _brand: 'ContextManifestId' }
export type ContextQualityReportId = string & { readonly _brand: 'ContextQualityReportId' }
export type PolicyId               = string & { readonly _brand: 'PolicyId' }
export type OperationId            = string & { readonly _brand: 'OperationId' }
export type ContentHash            = string & { readonly _brand: 'ContentHash' }

// Typed constructors — avoid `as any` in production code
export const contextPackageId  = (v: string) => v as ContextPackageId
export const contextContractId = (v: string) => v as ContextContractId
export const contextItemId     = (v: string) => v as ContextItemId
export const contextManifestId = (v: string) => v as ContextManifestId
export const contextQualityReportId = (v: string) => v as ContextQualityReportId
export const policyId          = (v: string) => v as PolicyId
export const operationId       = (v: string) => v as OperationId
export const contentHash       = (v: string) => v as ContentHash

// ── Score validation ──────────────────────────────────────────────────────────
export function clampScore(v: number): number {
  if (!isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

export function validateScore(v: number, label: string): number {
  if (!isFinite(v) || v < 0 || v > 1) {
    throw new RangeError(`${label} score ${v} out of [0,1]`)
  }
  return v
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
export const ContextPackageLifecycle = Object.freeze({
  DRAFT:               'DRAFT',
  ASSEMBLED:           'ASSEMBLED',
  EVALUATING:          'EVALUATING',
  ADMITTED:            'ADMITTED',
  ADMITTED_DEGRADED:   'ADMITTED_DEGRADED',
  CORRECTION_REQUIRED: 'CORRECTION_REQUIRED',
  SUPERSEDED:          'SUPERSEDED',
  REJECTED:            'REJECTED',
} as const)
export type ContextPackageLifecycle = typeof ContextPackageLifecycle[keyof typeof ContextPackageLifecycle]

const LIFECYCLE_TRANSITIONS: Readonly<Partial<Record<ContextPackageLifecycle, readonly ContextPackageLifecycle[]>>> = Object.freeze({
  DRAFT:               ['ASSEMBLED', 'REJECTED'],
  ASSEMBLED:           ['EVALUATING', 'REJECTED'],
  EVALUATING:          ['ADMITTED', 'ADMITTED_DEGRADED', 'CORRECTION_REQUIRED', 'REJECTED'],
  CORRECTION_REQUIRED: ['EVALUATING', 'REJECTED'],
  ADMITTED:            ['SUPERSEDED'],
  ADMITTED_DEGRADED:   ['SUPERSEDED'],
})

export function isValidLifecycleTransition(from: ContextPackageLifecycle, to: ContextPackageLifecycle): boolean {
  return (LIFECYCLE_TRANSITIONS[from] ?? []).includes(to)
}

export function assertLifecycleTransition(from: ContextPackageLifecycle, to: ContextPackageLifecycle): void {
  if (!isValidLifecycleTransition(from, to)) {
    throw new Error(`Invalid lifecycle transition: ${from} → ${to}`)
  }
}

export const ContextAdmissionDecision = Object.freeze({
  ADMITTED:          'admitted',
  ADMITTED_DEGRADED: 'admitted_degraded',
  RETRY_REQUIRED:    'retry_required',
  REJECTED:          'rejected',
} as const)
export type ContextAdmissionDecision = typeof ContextAdmissionDecision[keyof typeof ContextAdmissionDecision]

// ── Quality dimensions ────────────────────────────────────────────────────────
export const QualityDimension = Object.freeze({
  RELEVANCE:    'relevance',
  AUTHORITY:    'authority',
  COVERAGE:     'coverage',
  COHERENCE:    'coherence',
  CONSISTENCY:  'consistency',
  FRESHNESS:    'freshness',
  PROVENANCE:   'provenance',
  EFFICIENCY:   'efficiency',
  SAFETY:       'safety',
} as const)
export type QualityDimension = typeof QualityDimension[keyof typeof QualityDimension]

// Convention: a score of 1.0 for an empty evaluator input means "no violation observed", NOT "high quality".
export interface ContextQualityVector {
  readonly relevance:   number
  readonly authority:   number
  readonly coverage:    number
  readonly coherence:   number
  readonly consistency: number
  readonly freshness:   number
  readonly provenance:  number
  readonly efficiency:  number
  readonly safety:      number
}

// Weights must sum to 1.0 — enforced by constitutional test
export const DEFAULT_QUALITY_WEIGHTS: Readonly<Record<QualityDimension, number>> = Object.freeze({
  coverage:     0.20,
  relevance:    0.17,
  authority:    0.15,
  consistency:  0.12,
  coherence:    0.10,
  provenance:   0.08,
  freshness:    0.07,
  efficiency:   0.06,
  safety:       0.05,
})

// ── Security metadata ─────────────────────────────────────────────────────────
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted'

export interface ContextSecurityMetadata {
  readonly tenantId?:                  string
  readonly classification:             DataClassification
  readonly allowedPrincipals?:         readonly string[]
  readonly allowedConsumerKinds?:      readonly ConsumerKind[]
  readonly externalDisclosureAllowed:  boolean
  readonly residency?:                 readonly string[]
  readonly containsSecrets:            boolean
  readonly redactionState:             'not-required' | 'complete' | 'incomplete'
}

// ── Context contract ──────────────────────────────────────────────────────────
export type SourceKind = 'specification' | 'adr' | 'implementation' | 'comment' | 'chat' | 'deployment' | 'generated'

export interface ContextRequirement {
  readonly requirementId:        string
  readonly type:                 'fact' | 'artifact' | 'decision' | 'constraint' | 'history' | 'procedure' | 'evidence'
  readonly description:          string
  readonly mandatory:            boolean
  readonly minimumAuthority?:    number
  readonly maximumAgeMs?:        number
  readonly acceptedSourceKinds?: readonly SourceKind[]
  readonly cardinality?: {
    readonly minimum?: number
    readonly maximum?: number
  }
}

export interface ContextBudget {
  readonly maximumInputTokens:          number
  readonly reservedOutputTokens:        number
  readonly maximumItems?:               number
  readonly maximumSources?:             number
  readonly maximumAssemblyLatencyMs?:   number
  readonly maximumEvaluationLatencyMs?: number
  readonly softLimitRatio?:             number
}

export type ContextRetryStrategy = 'retrieve_missing' | 'expand_items' | 'compress_items' | 'reselect_provider'

export interface AdmissionPolicy {
  readonly policyId:              PolicyId
  readonly minimumCompositeScore: number
  readonly mandatoryDimensions:   readonly QualityDimension[]
  readonly dimensionFloors:       Readonly<Partial<Record<QualityDimension, number>>>
  readonly allowDegraded:         boolean
  readonly degradedDimensionFloors?: Readonly<Partial<Record<QualityDimension, number>>>
  readonly maximumRetries:        number
  readonly retryStrategies:       readonly ContextRetryStrategy[]
}

export type ContextRequirement_contextRequirement = 'required' | 'optional' | 'none'

export interface ContextContract {
  readonly contractId:           ContextContractId
  readonly operationId:          OperationId
  readonly purpose:              string
  readonly requirements:         readonly ContextRequirement[]
  readonly budget:               ContextBudget
  readonly admissionPolicy:      AdmissionPolicy
  readonly contextRequirement:   ContextRequirement_contextRequirement
  readonly authorityPolicyRef?:  string
  readonly safetyPolicyRef?:     string
  readonly deterministic:        boolean
}

// ── Context package ───────────────────────────────────────────────────────────
export type ContextRepresentation = 'verbatim' | 'extract' | 'summary' | 'structured' | 'derived'

export interface ProvenanceRecord {
  readonly sourceId:        string
  readonly sourceKind:      SourceKind
  readonly transformations: readonly string[]
  readonly capturedAt:      Date
}

export interface AuthorityAssessment {
  readonly score:      number
  readonly sourceKind: SourceKind
  readonly rationale?: string
}

export interface RelevanceAssessment {
  readonly score:           number
  readonly requirementRefs: readonly string[]
}

export interface TemporalValidity {
  readonly validFrom:   Date
  readonly validUntil?: Date
  readonly ageMs:       number
}

export type ConflictState = 'none' | 'resolved' | 'unresolved'

export interface ContextContent {
  readonly text:      string
  readonly encoding?: 'utf-8'
}

export interface ContextItem {
  readonly itemId:             ContextItemId
  readonly sourceRef:          string
  readonly content:            ContextContent
  readonly contentHash:        ContentHash
  readonly representation:     ContextRepresentation
  readonly provenance:         ProvenanceRecord
  readonly authority:          AuthorityAssessment
  readonly relevance:          RelevanceAssessment
  readonly security:           ContextSecurityMetadata
  readonly temporalValidity?:  TemporalValidity
  readonly conflictState?:     ConflictState
  readonly estimatedTokens:    number
}

export interface ContextRelationship {
  readonly fromItemId: ContextItemId
  readonly toItemId:   ContextItemId
  readonly kind:       'depends_on' | 'supersedes' | 'contradicts' | 'supports'
}

export interface ContextUsageEstimate {
  readonly estimatedInputTokens:  number
  readonly estimatedOutputTokens: number
  readonly estimatedItems:        number
}

export interface ContextAssemblyTrace {
  readonly assembledAt:      Date
  readonly assemblerVersion: string
  readonly stagesApplied:    readonly string[]
}

export interface ContextPackage {
  readonly packageId:       ContextPackageId
  readonly operationId:     OperationId
  readonly contractId:      ContextContractId
  readonly createdAt:       Date
  readonly assemblyVersion: string
  readonly items:           readonly ContextItem[]
  readonly relationships:   readonly ContextRelationship[]
  readonly estimatedUsage:  ContextUsageEstimate
  readonly assemblyTrace:   ContextAssemblyTrace
  readonly packageHash:     ContentHash
}

// ── Requirement coverage ──────────────────────────────────────────────────────
export const RequirementCoverageStatus = Object.freeze({
  SATISFIED:           'satisfied',
  PARTIALLY_SATISFIED: 'partially_satisfied',
  UNSATISFIED:         'unsatisfied',
  CONFLICTED:          'conflicted',
} as const)
export type RequirementCoverageStatus = typeof RequirementCoverageStatus[keyof typeof RequirementCoverageStatus]

export interface RequirementCoverage {
  readonly requirementId:     string
  readonly mandatory:         boolean
  readonly status:            RequirementCoverageStatus
  readonly supportingItemIds: readonly ContextItemId[]
  readonly score:             number
  readonly cardinalityMet:    boolean
}

// ── Quality violations and warnings ──────────────────────────────────────────
export interface QualityViolation {
  readonly dimension:  QualityDimension
  readonly score:      number
  readonly threshold:  number
  readonly message:    string
  readonly requirementId?: string
  readonly itemId?:    ContextItemId
}

export interface QualityWarning {
  readonly dimension: QualityDimension
  readonly message:   string
  readonly itemId?:   ContextItemId
}

export interface ContextQualityReport {
  readonly reportId:         ContextQualityReportId
  readonly packageId:        ContextPackageId
  readonly vector:           ContextQualityVector
  readonly compositeScore:   number
  readonly coverage:         readonly RequirementCoverage[]
  readonly violations:       readonly QualityViolation[]
  readonly warnings:         readonly QualityWarning[]
  readonly evaluatedAt:      Date
  readonly evaluatorVersion: string
  readonly policyId:         PolicyId
  readonly policyHash:       ContentHash
}

// ── Consumer profile ──────────────────────────────────────────────────────────
export type ConsumerKind = 'llm' | 'ml_model' | 'planning_engine' | 'rule_engine' | 'code_generator' | 'human_review'
export type ContextUnit  = 'token' | 'byte' | 'item' | 'feature'

export interface ConsumerContextProfile {
  readonly consumerId?:               string
  readonly consumerKind:              ConsumerKind
  readonly maximumContextUnits:       number
  readonly contextUnit:               ContextUnit
  readonly supportedRepresentations:  readonly ContextRepresentation[]
  readonly supportsStructuredContext: boolean
  readonly supportsSourceAnnotations: boolean
  readonly executionLocation:         'local' | 'remote'
  readonly principalId?:              string
  readonly tenantId?:                 string
  readonly residency?:                string
  readonly maximumClassification?:    DataClassification
}

// ── Budget status ─────────────────────────────────────────────────────────────
export const BudgetStatus = Object.freeze({
  WITHIN_BUDGET:             'within_budget',
  SOFT_LIMIT_EXCEEDED:       'soft_limit_exceeded',
  HARD_LIMIT_EXCEEDED:       'hard_limit_exceeded',
  ESTIMATE_UNAVAILABLE:      'estimate_unavailable',
  CONSUMER_UNIT_UNSUPPORTED: 'consumer_unit_unsupported',
} as const)
export type BudgetStatus = typeof BudgetStatus[keyof typeof BudgetStatus]

export interface BudgetGovernorResult {
  readonly status:               BudgetStatus
  readonly totalEstimatedTokens: number
  readonly effectiveBudget:      number
  readonly overageTokens:        number
  readonly sourceCount?:         number
}

// ── Retry directive ───────────────────────────────────────────────────────────
export type ContextCorrectionAction =
  | { readonly type: 'retrieve_requirement'; readonly requirementId: string }
  | { readonly type: 'expand_item';           readonly itemId: ContextItemId }
  | { readonly type: 'compress_item';         readonly itemId: ContextItemId }
  | { readonly type: 'remove_item';           readonly itemId: ContextItemId }
  | { readonly type: 'resolve_conflict';      readonly conflictId: string }
  | { readonly type: 'change_representation'; readonly itemId: ContextItemId }
  | { readonly type: 'reselect_provider';     readonly requiredCapacity: number }

export interface ContextRetryBudget {
  readonly remainingAttempts:   number
  readonly remainingLatencyMs?: number
}

export interface ContextRetryDirective {
  readonly previousPackageId: ContextPackageId
  readonly attempt:           number
  readonly reasons:           readonly string[]
  readonly requestedActions:  readonly ContextCorrectionAction[]
  readonly remainingBudget:   ContextRetryBudget
}

export interface AdmissionReason {
  readonly code:    string
  readonly message: string
}

export interface ContextAdmissionResult {
  readonly decision:          ContextAdmissionDecision
  readonly admittedManifest?: ContextManifest
  readonly retryDirective?:   ContextRetryDirective
  readonly reasons:           readonly AdmissionReason[]
}

// ── Context manifest ──────────────────────────────────────────────────────────
export interface ContextManifestEntry {
  readonly itemId:          ContextItemId
  readonly sourceRef:       string
  readonly representation:  ContextRepresentation
  readonly estimatedTokens: number
  readonly requirementRefs: readonly string[]
}

export interface ContextUsage {
  readonly totalTokens:  number
  readonly totalItems:   number
  readonly totalSources: number
}

export interface ContextManifest {
  readonly manifestId:        ContextManifestId
  readonly packageId:         ContextPackageId
  readonly reportId:          ContextQualityReportId
  readonly itemEntries:       readonly ContextManifestEntry[]
  readonly totalUsage:        ContextUsage
  readonly qualityVector:     ContextQualityVector
  readonly admissionDecision: ContextAdmissionDecision
  readonly degradationReasons?: readonly string[]
  readonly contractHash:      ContentHash
  readonly packageHash:       ContentHash
  readonly policyHash:        ContentHash
}

// ── Provider invocation boundary ──────────────────────────────────────────────
export interface NoContextRequiredDeclaration {
  readonly kind:            'context-free'
  readonly operationId:     OperationId
  readonly contractId:      ContextContractId
  readonly contractHash:    ContentHash
  readonly declarationHash: ContentHash
}

export type InvocationContext =
  | {
      readonly kind:     'contextual'
      readonly manifest: ContextManifest
      readonly pkg:      ContextPackage
    }
  | {
      readonly kind:        'context-free'
      readonly declaration: NoContextRequiredDeclaration
    }

// ── Telemetry ─────────────────────────────────────────────────────────────────
export interface ContextQualityTelemetryEvent {
  readonly eventType: ContextQualityEvent
  readonly packageId: ContextPackageId
  readonly timestamp: Date
  readonly payload?:  Record<string, unknown>
}

export interface ContextQualityTelemetry {
  emit(event: ContextQualityTelemetryEvent): void | Promise<void>
}

// ── DI interfaces ─────────────────────────────────────────────────────────────
export interface Clock {
  now(): Date
}

export interface IdGenerator {
  nextId(kind: string): string
}

export const SystemClock: Clock = { now: () => new Date() }

// ── Telemetry events ──────────────────────────────────────────────────────────
export const ContextQualityEvent = Object.freeze({
  EVALUATION_STARTED:        'context.evaluation.started',
  EVALUATION_COMPLETED:      'context.evaluation.completed',
  ADMISSION_GRANTED:         'context.admission.granted',
  ADMISSION_DEGRADED:        'context.admission.degraded',
  ADMISSION_RETRY_REQUESTED: 'context.admission.retry_requested',
  ADMISSION_REJECTED:        'context.admission.rejected',
  BUDGET_EXCEEDED:           'context.budget.exceeded',
  REQUIREMENT_UNSATISFIED:   'context.requirement.unsatisfied',
  QUALITY_THRESHOLD_FAILED:  'context.quality.threshold_failed',
  SAFETY_BLOCKED:            'context.safety.blocked',
} as const)
export type ContextQualityEvent = typeof ContextQualityEvent[keyof typeof ContextQualityEvent]

// ── Error codes ───────────────────────────────────────────────────────────────
export const ContextQualityErrorCode = Object.freeze({
  REQUIRED_ITEM_MISSING:           'CONTEXT_REQUIRED_ITEM_MISSING',
  MANDATORY_COVERAGE_FAILED:       'CONTEXT_MANDATORY_COVERAGE_FAILED',
  QUALITY_DIMENSION_BELOW_THRESHOLD: 'CONTEXT_QUALITY_DIMENSION_BELOW_THRESHOLD',
  COMPOSITE_SCORE_BELOW_THRESHOLD: 'CONTEXT_COMPOSITE_SCORE_BELOW_THRESHOLD',
  AUTHORITY_BELOW_THRESHOLD:       'CONTEXT_AUTHORITY_BELOW_THRESHOLD',
  CONFLICT_UNRESOLVED:             'CONTEXT_CONFLICT_UNRESOLVED',
  PROVENANCE_INCOMPLETE:           'CONTEXT_PROVENANCE_INCOMPLETE',
  BUDGET_EXCEEDED:                 'CONTEXT_BUDGET_EXCEEDED',
  SAFETY_POLICY_VIOLATION:         'CONTEXT_SAFETY_POLICY_VIOLATION',
  EVALUATION_UNAVAILABLE:          'CONTEXT_EVALUATION_UNAVAILABLE',
  RETRY_LIMIT_EXCEEDED:            'CONTEXT_RETRY_LIMIT_EXCEEDED',
  PACKAGE_MUTATED:                 'CONTEXT_PACKAGE_MUTATED',
  CONSUMER_PROFILE_INCOMPATIBLE:   'CONTEXT_CONSUMER_PROFILE_INCOMPATIBLE',
  INVOCATION_WITHOUT_ADMISSION:    'CONTEXT_INVOCATION_WITHOUT_ADMISSION',
} as const)
export type ContextQualityErrorCode = typeof ContextQualityErrorCode[keyof typeof ContextQualityErrorCode]

export class ContextQualityError extends Error {
  constructor(
    message: string,
    public readonly code: ContextQualityErrorCode,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ContextQualityError'
  }
}

// ── Service interfaces ────────────────────────────────────────────────────────
export interface ContextQualityService {
  evaluateAndAdmit(
    pkg:      ContextPackage,
    contract: ContextContract,
    consumer: ConsumerContextProfile,
    attemptCount?: number,
  ): Promise<ContextAdmissionResult>
}

export interface ContextAdmissionService {
  decide(
    report:       ContextQualityReport,
    policy:       AdmissionPolicy,
    pkg:          ContextPackage,
    contract:     ContextContract,
    attemptCount: number,
  ): Promise<ContextAdmissionResult>
}

// ── Canonical hashing ─────────────────────────────────────────────────────────
export function computePackageHash(pkg: Omit<ContextPackage, 'packageHash'>): ContentHash {
  const canonical = JSON.stringify({
    packageId:       pkg.packageId,
    operationId:     pkg.operationId,
    contractId:      pkg.contractId,
    createdAt:       pkg.createdAt.toISOString(),
    assemblyVersion: pkg.assemblyVersion,
    items: pkg.items.map(item => ({
      itemId:      item.itemId,
      sourceRef:   item.sourceRef,
      contentHash: item.contentHash,
      representation: item.representation,
      content: { text: item.content.text, encoding: item.content.encoding ?? null },
      authority: {
        score:      item.authority.score,
        sourceKind: item.authority.sourceKind,
        rationale:  item.authority.rationale ?? null,
      },
      relevance: {
        score:           item.relevance.score,
        requirementRefs: item.relevance.requirementRefs,
      },
      provenance: {
        sourceId:        item.provenance.sourceId,
        sourceKind:      item.provenance.sourceKind,
        transformations: item.provenance.transformations,
        capturedAt:      item.provenance.capturedAt.toISOString(),
      },
      security: {
        tenantId:                  item.security.tenantId ?? null,
        classification:            item.security.classification,
        allowedPrincipals:         [...(item.security.allowedPrincipals ?? [])].sort(),
        allowedConsumerKinds:      [...(item.security.allowedConsumerKinds ?? [])].sort(),
        externalDisclosureAllowed: item.security.externalDisclosureAllowed,
        residency:                 [...(item.security.residency ?? [])].sort(),
        containsSecrets:           item.security.containsSecrets,
        redactionState:            item.security.redactionState,
      },
      temporalValidity: item.temporalValidity ? {
        validFrom:  item.temporalValidity.validFrom.toISOString(),
        validUntil: item.temporalValidity.validUntil?.toISOString() ?? null,
        ageMs:      item.temporalValidity.ageMs,
      } : null,
      conflictState:    item.conflictState ?? 'none',
      estimatedTokens:  item.estimatedTokens,
    })),
    relationships:   pkg.relationships,
    estimatedUsage:  pkg.estimatedUsage,
    assemblyTrace: {
      assembledAt:      pkg.assemblyTrace.assembledAt.toISOString(),
      assemblerVersion: pkg.assemblyTrace.assemblerVersion,
      stagesApplied:    pkg.assemblyTrace.stagesApplied,
    },
  })
  return createHash('sha256').update(canonical).digest('hex') as ContentHash
}

function sortedRecord(rec: Partial<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(rec)
      .filter((e): e is [string, number] => e[1] !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
  )
}

export function computeContractHash(contract: ContextContract): ContentHash {
  const canonical = JSON.stringify({
    contractId:         contract.contractId,
    operationId:        contract.operationId,
    purpose:            contract.purpose,
    contextRequirement: contract.contextRequirement,
    requirements: contract.requirements.map(req => ({
      requirementId:        req.requirementId,
      type:                 req.type,
      description:          req.description,
      mandatory:            req.mandatory,
      minimumAuthority:     req.minimumAuthority ?? null,
      maximumAgeMs:         req.maximumAgeMs ?? null,
      acceptedSourceKinds:  req.acceptedSourceKinds ? [...req.acceptedSourceKinds].sort() : null,
      cardinality:          req.cardinality
        ? { minimum: req.cardinality.minimum ?? null, maximum: req.cardinality.maximum ?? null }
        : null,
    })),
    admissionPolicy:    canonicalAdmissionPolicy(contract.admissionPolicy),
    deterministic:      contract.deterministic,
    authorityPolicyRef: contract.authorityPolicyRef ?? null,
    safetyPolicyRef:    contract.safetyPolicyRef ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex') as ContentHash
}

function canonicalAdmissionPolicy(policy: AdmissionPolicy) {
  return {
    policyId:              policy.policyId,
    minimumCompositeScore: policy.minimumCompositeScore,
    mandatoryDimensions:   [...policy.mandatoryDimensions].sort(),
    dimensionFloors:       sortedRecord(policy.dimensionFloors as Record<string, number>),
    allowDegraded:         policy.allowDegraded,
    degradedDimensionFloors: policy.degradedDimensionFloors
      ? sortedRecord(policy.degradedDimensionFloors as Record<string, number>)
      : null,
    maximumRetries:  policy.maximumRetries,
    retryStrategies: [...policy.retryStrategies],
  }
}

export function computePolicyHash(policy: AdmissionPolicy): ContentHash {
  const canonical = JSON.stringify(canonicalAdmissionPolicy(policy))
  return createHash('sha256').update(canonical).digest('hex') as ContentHash
}

export function computeContentHash(text: string): ContentHash {
  return createHash('sha256').update(text).digest('hex') as ContentHash
}

// ── Default admission policy ──────────────────────────────────────────────────
export const DEFAULT_ADMISSION_POLICY: AdmissionPolicy = Object.freeze({
  policyId:              policyId('default-v1'),
  minimumCompositeScore: 0.78,
  mandatoryDimensions:   Object.freeze([
    QualityDimension.COVERAGE,
    QualityDimension.AUTHORITY,
    QualityDimension.PROVENANCE,
    QualityDimension.SAFETY,
  ]),
  dimensionFloors: Object.freeze({
    coverage:    0.6,
    authority:   0.5,
    provenance:  0.5,
    safety:      0.9,
  }),
  allowDegraded:   true,
  maximumRetries:  2,
  retryStrategies: Object.freeze(['retrieve_missing', 'compress_items'] as ContextRetryStrategy[]),
})

// ── System overhead constants ─────────────────────────────────────────────────
export const CONTEXT_PROTOCOL_OVERHEAD_TOKENS = 200
export const CONTEXT_SAFETY_MARGIN_TOKENS      = 100
