import type { ProvenanceAssessmentResult, ProvenanceVerificationRequest } from './types.js'
import { ProvenanceRequestValidator } from './provenance-request-validator.js'
import { ProvenanceStatementParser } from './provenance-statement-parser.js'
import { ProvenanceSubjectBinder } from './provenance-subject-binder.js'
import { SourceIdentityValidator } from './source-identity-validator.js'
import { BuilderIdentityValidator } from './builder-identity-validator.js'
import { BuildInputValidator } from './build-input-validator.js'
import { BuildOutputValidator } from './build-output-validator.js'
import { ProvenancePolicyEvaluator } from './provenance-policy-evaluator.js'
import { AssessmentBuilder } from './assessment-builder.js'

export class ProvenanceVerifier {
  private readonly requestValidator = new ProvenanceRequestValidator()
  private readonly statementParser = new ProvenanceStatementParser()
  private readonly subjectBinder = new ProvenanceSubjectBinder()
  private readonly sourceValidator = new SourceIdentityValidator()
  private readonly builderValidator = new BuilderIdentityValidator()
  private readonly inputValidator = new BuildInputValidator()
  private readonly outputValidator = new BuildOutputValidator()
  private readonly policyEvaluator = new ProvenancePolicyEvaluator()
  private readonly assessmentBuilder = new AssessmentBuilder()

  verify(request: ProvenanceVerificationRequest): ProvenanceAssessmentResult {
    const requestResult = this.requestValidator.validate(request)
    if (!requestResult.valid) {
      return this.assessmentBuilder.failed(
        requestResult.reason ?? 'evaluation-failed',
        request.subject,
        request.evaluatedAt,
      )
    }

    const { provenanceStatement: stmt, policy, evaluatedAt } = request

    const parseResult = this.statementParser.parse(stmt)
    if (!parseResult.valid) {
      return this.assessmentBuilder.failed(
        parseResult.reason ?? 'malformed-provenance',
        request.subject,
        evaluatedAt,
        { statementId: stmt.statementId, statementType: stmt.statementType, statementVersion: stmt.statementVersion },
      )
    }

    const observedIntegrity = request.integrityAssessment.observedIntegrity
    if (!observedIntegrity) {
      return this.assessmentBuilder.failed(
        'missing-provenance',
        request.subject,
        evaluatedAt,
        { statementId: stmt.statementId },
      )
    }

    const bindingResult = this.subjectBinder.bind(
      stmt,
      observedIntegrity,
      request.subject.packageId,
      request.subject.version,
      policy,
    )
    if (!bindingResult.bound) {
      return this.assessmentBuilder.failed(
        bindingResult.reason ?? 'artifact-digest-mismatch',
        request.subject,
        evaluatedAt,
        { statementId: stmt.statementId, statementType: stmt.statementType, statementVersion: stmt.statementVersion },
      )
    }

    const sourceResult = this.sourceValidator.validate(stmt.sourceIdentity, policy, evaluatedAt)
    const builderResult = this.builderValidator.validate(
      stmt.builderIdentity,
      policy,
      request.revocationAssessment,
      request.publisherTrustAssessment,
    )
    const inputResult = this.inputValidator.validate(stmt.materials, policy)
    const outputResult = this.outputValidator.validate(
      stmt.outputs,
      observedIntegrity,
      request.subject.packageId,
      request.subject.version,
      policy,
    )

    const policyResult = this.policyEvaluator.evaluate(
      stmt,
      policy,
      evaluatedAt,
      builderResult.valid,
      sourceResult.valid,
      inputResult.valid,
      outputResult.valid,
    )

    if (!policyResult.satisfied) {
      const firstViolation = policyResult.violations[0]
      if (!sourceResult.valid) {
        return this.assessmentBuilder.failed(
          sourceResult.reason ?? 'source-identity-mismatch',
          request.subject,
          evaluatedAt,
          { statementId: stmt.statementId, statementType: stmt.statementType, statementVersion: stmt.statementVersion, policyViolations: policyResult.violations },
        )
      }
      if (!builderResult.valid) {
        return this.assessmentBuilder.failed(
          builderResult.reason ?? 'builder-untrusted',
          request.subject,
          evaluatedAt,
          { statementId: stmt.statementId, statementType: stmt.statementType, statementVersion: stmt.statementVersion, policyViolations: policyResult.violations },
        )
      }
      if (!inputResult.valid) {
        return this.assessmentBuilder.failed(
          inputResult.reason ?? 'input-set-incomplete',
          request.subject,
          evaluatedAt,
          { statementId: stmt.statementId, statementType: stmt.statementType, statementVersion: stmt.statementVersion, policyViolations: policyResult.violations },
        )
      }
      if (!outputResult.valid) {
        return this.assessmentBuilder.failed(
          outputResult.reason ?? 'output-mismatch',
          request.subject,
          evaluatedAt,
          { statementId: stmt.statementId, statementType: stmt.statementType, statementVersion: stmt.statementVersion, policyViolations: policyResult.violations },
        )
      }
      return this.assessmentBuilder.failed(
        firstViolation?.code === 'evidence-expired' ? 'evidence-expired' : 'policy-unsatisfied',
        request.subject,
        evaluatedAt,
        { statementId: stmt.statementId, statementType: stmt.statementType, statementVersion: stmt.statementVersion, policyViolations: policyResult.violations },
      )
    }

    if (policyResult.degraded) {
      return this.assessmentBuilder.degraded(
        request.subject,
        evaluatedAt,
        policyResult.degradationReasons,
        {
          ...(builderResult.builderIdentity !== undefined ? { builderIdentity: builderResult.builderIdentity } : {}),
          ...(sourceResult.sourceRevision !== undefined ? { sourceRevision: sourceResult.sourceRevision } : {}),
          artifactDigest: observedIntegrity,
          statementId: stmt.statementId,
          statementType: stmt.statementType,
          statementVersion: stmt.statementVersion,
          materialEvidenceIds: inputResult.materialEvidenceIds ?? [],
          outputEvidenceIds: outputResult.outputEvidenceIds ?? [],
        },
      )
    }

    return this.assessmentBuilder.verified(
      request.subject,
      evaluatedAt,
      builderResult.builderIdentity ?? 'unknown',
      sourceResult.sourceRevision ?? 'unknown',
      observedIntegrity,
      stmt.statementId,
      stmt.statementType,
      stmt.statementVersion,
      inputResult.materialEvidenceIds ?? [],
      outputResult.outputEvidenceIds ?? [],
    )
  }
}
