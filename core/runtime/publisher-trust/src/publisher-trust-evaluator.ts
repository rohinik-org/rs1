import type { PublisherTrustAssessment, PublisherTrustEvaluationRequest, TrustRootProvider } from './types.js'
import { PublisherIdentityValidator } from './publisher-identity-validator.js'
import { SignerPublisherBindingValidator } from './signer-publisher-binding-validator.js'
import { TrustRootResolver } from './trust-root-resolver.js'
import { TrustPathBuilder } from './trust-path-builder.js'
import { TrustScopeEvaluator } from './trust-scope-evaluator.js'
import { AssessmentBuilder } from './assessment-builder.js'

export class PublisherTrustEvaluator {
  private readonly identityValidator = new PublisherIdentityValidator()
  private readonly bindingValidator = new SignerPublisherBindingValidator()
  private readonly rootResolver = new TrustRootResolver()
  private readonly pathBuilder = new TrustPathBuilder()
  private readonly scopeEvaluator = new TrustScopeEvaluator()
  private readonly builder = new AssessmentBuilder()

  async evaluate(
    request: PublisherTrustEvaluationRequest,
    provider: TrustRootProvider,
  ): Promise<PublisherTrustAssessment> {
    const { subject, signatureAssessment, publisherIdentity, evaluatedAt, trustContext } = request

    // Step 1: require successful signature (L-9J-401)
    if (!signatureAssessment.passed) {
      return this.builder.failed('signature-not-verified', subject, evaluatedAt, { publisherIdentity })
    }

    // Step 2: validate publisher identity (L-9J-403)
    const identityValidation = this.identityValidator.validate(publisherIdentity)
    if (!identityValidation.valid) {
      return this.builder.failed('publisher-identity-invalid', subject, evaluatedAt, {
        publisherIdentity,
        reason: identityValidation.reason,
      })
    }

    // Step 3: validate signer-to-publisher binding (L-9J-402)
    const bindings = trustContext?.bindingEvidence ?? []
    const bindingResult = this.bindingValidator.validate(signatureAssessment, publisherIdentity, bindings)
    if (!bindingResult.valid) {
      const outcome =
        bindingResult.reason === 'no-signature' ? 'signature-not-verified' :
        bindingResult.reason === 'ambiguous-binding' ? 'ambiguous-trust-path' :
        'signer-publisher-mismatch'
      return this.builder.failed(outcome, subject, evaluatedAt, { publisherIdentity, reason: bindingResult.reason })
    }

    const signerId = bindingResult.signerId

    // Step 4: resolve candidate trust roots (L-9J-405)
    const resolutionResult = await this.rootResolver.resolve(provider, publisherIdentity, subject, evaluatedAt)
    if (!resolutionResult.resolved) {
      const outcome = resolutionResult.reason === 'not-found' ? 'trust-root-not-found' : 'evaluation-failed'
      return this.builder.failed(outcome, subject, evaluatedAt, { publisherIdentity, signerId })
    }

    const roots = resolutionResult.roots

    // Step 5: evaluate trust scope (L-9J-406) and time validity
    const scopeResult = this.scopeEvaluator.evaluate(roots, subject, evaluatedAt)
    if (!scopeResult.passed) {
      const outcome =
        scopeResult.reason === 'not-yet-valid' ? 'trust-root-not-yet-valid' :
        scopeResult.reason === 'expired' ? 'trust-root-expired' :
        'trust-scope-mismatch'
      return this.builder.failed(outcome, subject, evaluatedAt, { publisherIdentity, signerId })
    }

    // Step 6: build deterministic trust path (L-9J-404, L-9J-408)
    const pathResult = this.pathBuilder.build(signerId, roots)
    if (!pathResult.built) {
      const outcome =
        pathResult.reason === 'ambiguous-path' ? 'ambiguous-trust-path' :
        pathResult.reason === 'cycle-detected' ? 'evaluation-failed' :
        'trust-path-not-found'
      return this.builder.failed(outcome, subject, evaluatedAt, { publisherIdentity, signerId })
    }

    // Find the trust root that anchors this path
    const selectedRoot = roots.find(r => r.anchorId === pathResult.path.anchorId)
    if (!selectedRoot) {
      return this.builder.failed('trust-path-not-found', subject, evaluatedAt, { publisherIdentity, signerId })
    }

    return this.builder.trusted(
      subject,
      publisherIdentity,
      signerId,
      evaluatedAt,
      selectedRoot.trustRootId,
      selectedRoot.anchorId,
      pathResult.path,
    )
  }
}
