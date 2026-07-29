import type { PackageTrustSubject } from '@rohinik-org/package-trust-ir'
import type { PublisherIdentity, TrustPath, PublisherTrustAssessment, PublisherTrustOutcome } from './types.js'

export class AssessmentBuilder {
  trusted(
    subject: PackageTrustSubject,
    publisherIdentity: PublisherIdentity,
    signerId: string,
    evaluatedAt: string,
    trustRootId: string,
    anchorId: string,
    trustPath: TrustPath,
  ): PublisherTrustAssessment {
    return Object.freeze({
      outcome: 'trusted' as PublisherTrustOutcome,
      passed: true,
      subject,
      publisherIdentity,
      signerId,
      evaluatedAt,
      trustRootId,
      anchorId,
      trustPath,
    })
  }

  failed(
    outcome: Exclude<PublisherTrustOutcome, 'trusted'>,
    subject: PackageTrustSubject,
    evaluatedAt: string,
    opts?: {
      publisherIdentity?: PublisherIdentity
      signerId?: string
      reason?: string
      trustRootId?: string
    },
  ): PublisherTrustAssessment {
    const base: PublisherTrustAssessment = {
      outcome,
      passed: false,
      subject,
      evaluatedAt,
    }
    return Object.freeze({
      ...base,
      ...(opts?.publisherIdentity !== undefined ? { publisherIdentity: opts.publisherIdentity } : {}),
      ...(opts?.signerId !== undefined ? { signerId: opts.signerId } : {}),
      ...(opts?.reason !== undefined ? { reason: opts.reason } : {}),
      ...(opts?.trustRootId !== undefined ? { trustRootId: opts.trustRootId } : {}),
    })
  }
}
