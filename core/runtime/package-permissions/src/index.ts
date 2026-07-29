// Re-export IR types used publicly
export type {
  CanonicalPermission,
  PackagePermissionManifest,
  AuthorizedPermission,
  DeniedPermission,
  PermissionEnforcementCapability,
  PermissionAssessment,
  PermissionEnforcementAssessment,
  PermissionPolicyRule,
  PackageTrustSubject,
} from '@rohinik-org/package-trust-ir'

// Package-local types
export type {
  PermissionExecutionContext,
  PermissionPolicy,
  PermissionCombinationRule,
  PermissionEvaluationRequest,
  PublisherTrustAssessmentRef,
  ProvenanceAssessmentRef,
  ExpansionFindingKind,
  PrivilegeExpansionFinding,
  LeastPrivilegeFindingKind,
  LeastPrivilegeFinding,
} from './types.js'

// Validation
export { validatePermissionEvaluationRequest } from './permission-request-validator.js'
export type { ValidationResult } from './permission-request-validator.js'

// Declaration parsing
export { parsePermissionDeclarations } from './permission-declaration-parser.js'
export type { ParsedDeclarations, ParseResult } from './permission-declaration-parser.js'

// Canonicalization
export { canonicalizePermissions } from './permission-canonicalizer.js'

// Scope evaluation
export { evaluatePermissionScope } from './permission-scope-evaluator.js'
export type { ScopeEvaluationResult } from './permission-scope-evaluator.js'

// Privilege expansion
export { detectPrivilegeExpansion } from './privilege-expansion-detector.js'

// Least privilege
export { evaluateLeastPrivilege } from './least-privilege-evaluator.js'

// Policy evaluation
export { evaluatePermissionPolicy } from './permission-policy-evaluator.js'
export type { PolicyEvaluationResult } from './permission-policy-evaluator.js'

// Assessment builder
export { buildPermissionAssessment } from './assessment-builder.js'

// Orchestrator
export { PermissionEvaluator } from './permission-evaluator.js'
