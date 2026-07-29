import type {
  ProvenanceStatement,
  ProvenancePolicy,
  PolicyEvaluationResult,
  PolicyViolation,
} from './types.js'

export class ProvenancePolicyEvaluator {
  evaluate(
    statement: ProvenanceStatement,
    policy: ProvenancePolicy,
    evaluatedAt: string,
    builderValid: boolean,
    sourceValid: boolean,
    inputsValid: boolean,
    outputValid: boolean,
  ): PolicyEvaluationResult {
    const violations: PolicyViolation[] = []
    const degradationReasons: string[] = []

    if (
      policy.acceptedStatementTypes.length > 0 &&
      !policy.acceptedStatementTypes.includes(statement.statementType)
    ) {
      violations.push({ code: 'unsupported-statement-type', detail: `Statement type '${statement.statementType}' not accepted` })
    }

    if (
      policy.acceptedStatementVersions.length > 0 &&
      !policy.acceptedStatementVersions.includes(statement.statementVersion)
    ) {
      violations.push({ code: 'unsupported-statement-version', detail: `Statement version '${statement.statementVersion}' not accepted` })
    }

    if (policy.maxProvenanceAgeSeconds !== undefined) {
      const issuedAt = Date.parse(statement.issuedAt)
      const now = Date.parse(evaluatedAt)
      const ageSeconds = (now - issuedAt) / 1000
      if (ageSeconds > policy.maxProvenanceAgeSeconds) {
        violations.push({ code: 'evidence-expired', detail: `Provenance age ${ageSeconds}s exceeds max ${policy.maxProvenanceAgeSeconds}s` })
      }
    }

    if (statement.notBefore && Date.parse(evaluatedAt) < Date.parse(statement.notBefore)) {
      violations.push({ code: 'evidence-not-yet-valid', detail: `Provenance not valid until ${statement.notBefore}` })
    }

    if (statement.notAfter && Date.parse(evaluatedAt) > Date.parse(statement.notAfter)) {
      violations.push({ code: 'evidence-expired', detail: `Provenance expired at ${statement.notAfter}` })
    }

    if (
      policy.trustedAuthorityIds.length > 0 &&
      !policy.trustedAuthorityIds.includes(statement.authorityIssuerId)
    ) {
      violations.push({ code: 'untrusted-authority', detail: `Issuer '${statement.authorityIssuerId}' not trusted` })
    }

    if (!builderValid) {
      violations.push({ code: 'builder-validation-failed', detail: 'Builder identity validation failed' })
    }

    if (!sourceValid) {
      violations.push({ code: 'source-validation-failed', detail: 'Source identity validation failed' })
    }

    if (!inputsValid) {
      violations.push({ code: 'input-validation-failed', detail: 'Build input validation failed' })
    }

    if (!outputValid) {
      violations.push({ code: 'output-validation-failed', detail: 'Build output validation failed' })
    }

    if (policy.requireReproducibleBuild) {
      if (policy.allowDegradedProvenance) {
        degradationReasons.push('reproducible-build-not-verified')
      } else {
        violations.push({ code: 'reproducible-build-required', detail: 'Reproducible build not verified' })
      }
    }

    if (violations.length === 0 && degradationReasons.length > 0 && policy.allowDegradedProvenance) {
      return { satisfied: true, degraded: true, violations: [], degradationReasons }
    }

    return {
      satisfied: violations.length === 0,
      degraded: false,
      violations,
      degradationReasons,
    }
  }
}
