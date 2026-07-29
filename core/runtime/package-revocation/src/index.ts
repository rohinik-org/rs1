export { RevocationEvaluator } from './revocation-evaluator.js'
export { validateRevocationContext } from './revocation-context-validator.js'
export { buildRevocationSubjects } from './revocation-subject-builder.js'
export { RevocationSourceResolver } from './revocation-source-resolver.js'
export { validateRevocationRecord } from './revocation-record-validator.js'
export { evaluateRevocationTime } from './revocation-time-evaluator.js'
export { buildRevocationAssessment } from './assessment-builder.js'
export {
  DEFAULT_REVOCATION_POLICY,
  toRevocationAssessment,
} from './types.js'
export type {
  SupportedRevocationTargetKind,
  RevocationSubject,
  InternalRevocationOutcome,
  TargetRevocationResult,
  RevocationEvaluationContext,
  RevocationPolicy,
  RevocationEvaluationRequest,
  RevocationEvidenceProvider,
} from './types.js'
