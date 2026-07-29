import type {
  PackageTrustSubject,
  IntegrityDigest,
  IntegrityAssessment,
  SignatureAssessment,
  RevocationAssessment,
  BuildProvenanceEnvelope,
} from '@rohinik-org/package-trust-ir'

// ─── Publisher trust assessment (local interface — publisher-trust pkg defines its own) ────
export interface PublisherTrustAssessment {
  readonly passed: boolean
  readonly outcome: string
}

// ─── Provenance source identity ───────────────────────────────────────────────
export type ProvenanceSourceRevisionKind =
  | 'commit-sha'
  | 'tag'
  | 'tree-digest'
  | 'content-digest'
  | 'branch'
  | 'unknown'

export interface ProvenanceSourceIdentity {
  readonly authority: string
  readonly organization?: string
  readonly repository: string
  readonly subpath?: string
  readonly revision: {
    readonly kind: ProvenanceSourceRevisionKind
    readonly value: string
  }
}

// ─── Builder identity ─────────────────────────────────────────────────────────
export type BuilderIdentityKind =
  | 'named-builder'
  | 'workflow'
  | 'ci-system'
  | 'anonymous'
  | 'unknown'

export interface ProvenanceBuilderIdentity {
  readonly kind: BuilderIdentityKind
  readonly builderId: string
  readonly buildSystemId?: string
  readonly workflowId?: string
  readonly version?: string
}

// ─── Build material ───────────────────────────────────────────────────────────
export type BuildMaterialKind =
  | 'source-tree'
  | 'lockfile'
  | 'manifest'
  | 'toolchain'
  | 'compiler'
  | 'build-script'
  | 'container-image'
  | 'base-image'
  | 'configuration'
  | 'generated-source'
  | 'external-material'

export interface BuildMaterial {
  readonly materialId: string
  readonly kind: BuildMaterialKind
  readonly uri: string
  readonly digest?: IntegrityDigest
  readonly mutableReference?: boolean
}

// ─── Build output ─────────────────────────────────────────────────────────────
export interface ProvenanceBuildOutput {
  readonly outputId: string
  readonly packageId?: string
  readonly version?: string
  readonly mediaType?: string
  readonly digest: IntegrityDigest
}

// ─── Provenance subject binding ───────────────────────────────────────────────
export interface ProvenanceSubject {
  readonly subjectId: string
  readonly packageId?: string
  readonly version?: string
  readonly digest: IntegrityDigest
}

// ─── Provenance statement ─────────────────────────────────────────────────────
export interface ProvenanceStatement {
  readonly statementId: string
  readonly statementType: string
  readonly statementVersion: string
  readonly subjects: readonly ProvenanceSubject[]
  readonly predicateType: string
  readonly issuedAt: string
  readonly notBefore?: string
  readonly notAfter?: string
  readonly sourceIdentity?: ProvenanceSourceIdentity
  readonly builderIdentity?: ProvenanceBuilderIdentity
  readonly buildInvocationId?: string
  readonly materials: readonly BuildMaterial[]
  readonly outputs: readonly ProvenanceBuildOutput[]
  readonly authorityIssuerId: string
  readonly signatureReference?: string
  readonly envelope: BuildProvenanceEnvelope
}

// ─── Provenance policy ────────────────────────────────────────────────────────
export interface ProvenancePolicy {
  readonly provenanceRequired: boolean
  readonly acceptedStatementTypes: readonly string[]
  readonly acceptedStatementVersions: readonly string[]
  readonly requiredBuilderIds: readonly string[]
  readonly requiredWorkflowIds: readonly string[]
  readonly requireImmutableSourceRevision: boolean
  readonly requireSourceTreeDigest: boolean
  readonly requiredMaterialKinds: readonly BuildMaterialKind[]
  readonly requireCompleteInputSet: boolean
  readonly requireOutputDigestBinding: boolean
  readonly requireReproducibleBuild: boolean
  readonly maxProvenanceAgeSeconds?: number
  readonly trustedAuthorityIds: readonly string[]
  readonly allowDegradedProvenance: boolean
}

// ─── Evaluation request ───────────────────────────────────────────────────────
export interface ProvenanceVerificationRequest {
  readonly subject: PackageTrustSubject
  readonly integrityAssessment: IntegrityAssessment
  readonly signatureAssessment?: SignatureAssessment
  readonly publisherTrustAssessment?: PublisherTrustAssessment
  readonly revocationAssessment?: RevocationAssessment
  readonly provenanceStatement: ProvenanceStatement
  readonly policy: ProvenancePolicy
  readonly evaluatedAt: string
}

// ─── Internal result types ────────────────────────────────────────────────────
export type ProvenanceOutcome =
  | 'verified'
  | 'verified-degraded'
  | 'missing-provenance'
  | 'malformed-provenance'
  | 'unsupported-provenance'
  | 'subject-mismatch'
  | 'artifact-digest-mismatch'
  | 'source-identity-mismatch'
  | 'source-revision-missing'
  | 'source-revision-invalid'
  | 'builder-untrusted'
  | 'builder-revoked'
  | 'input-set-incomplete'
  | 'input-digest-mismatch'
  | 'output-mismatch'
  | 'policy-unsatisfied'
  | 'evidence-expired'
  | 'ambiguous-provenance'
  | 'conflicting-provenance'
  | 'verification-unknown'
  | 'evaluation-failed'

export interface PolicyViolation {
  readonly code: string
  readonly detail: string
}

export interface ProvenanceAssessmentResult {
  readonly passed: boolean
  readonly outcome: ProvenanceOutcome
  readonly subject: PackageTrustSubject
  readonly evaluatedAt: string
  readonly builderIdentity?: string
  readonly sourceRevision?: string
  readonly artifactDigest?: IntegrityDigest
  readonly statementId?: string
  readonly statementType?: string
  readonly statementVersion?: string
  readonly materialEvidenceIds?: readonly string[]
  readonly outputEvidenceIds?: readonly string[]
  readonly policyViolations?: readonly PolicyViolation[]
  readonly degradationReasons?: readonly string[]
  readonly reason?: string
}

export type FailedProvenanceOutcome = Exclude<ProvenanceOutcome, 'verified' | 'verified-degraded'>

export interface RequestValidationResult {
  readonly valid: boolean
  readonly reason?: FailedProvenanceOutcome
}

export interface StatementParseResult {
  readonly valid: boolean
  readonly reason?: FailedProvenanceOutcome
}

export interface SubjectBindingResult {
  readonly bound: boolean
  readonly matchedSubjectId?: string
  readonly reason?: FailedProvenanceOutcome
}

export interface SourceValidationResult {
  readonly valid: boolean
  readonly sourceRevision?: string
  readonly reason?: FailedProvenanceOutcome
}

export interface BuilderValidationResult {
  readonly valid: boolean
  readonly builderIdentity?: string
  readonly reason?: FailedProvenanceOutcome
}

export interface InputValidationResult {
  readonly valid: boolean
  readonly materialEvidenceIds?: readonly string[]
  readonly reason?: FailedProvenanceOutcome
}

export interface OutputValidationResult {
  readonly valid: boolean
  readonly outputEvidenceIds?: readonly string[]
  readonly reason?: FailedProvenanceOutcome
}

export interface PolicyEvaluationResult {
  readonly satisfied: boolean
  readonly degraded: boolean
  readonly violations: readonly PolicyViolation[]
  readonly degradationReasons: readonly string[]
}
