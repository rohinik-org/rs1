import type { BaseArtifact } from './artifact.js'

// What a diagnostic artifact is about ("what am I about?").
// Distinct from ArtifactProvenance which records production chain.
export interface SubjectReference {
  readonly kind: string
  readonly id: string
}

export interface DiagnosticSubject {
  readonly kind:
    | 'benchmark-run'
    | 'plugin'
    | 'runtime'
    | 'artifact'
    | 'artifact-set'
    | 'session'
  readonly references: readonly SubjectReference[]
}

// Diagnostic artifacts — record analysis subjects ("what am I about?").
// ComplianceReport, ArchitectureViolationReport, OptimizationReport, etc.
export interface DiagnosticArtifactBase extends BaseArtifact {
  readonly subject: DiagnosticSubject
}
