import type {
  ArtifactByteReader,
  PackageTrustSubject,
  AcquisitionAuthorization,
  InertArtifactHandle,
  ExpectedIntegrityEvidence,
  IntegrityAssessment,
} from '@rohinik-org/package-trust-ir'
import { DigestComputer } from './digest-computer.js'
import { IntegrityEvidenceValidator } from './integrity-evidence-validator.js'
import { ConstantTimeDigestComparator } from './constant-time-digest-comparator.js'

export interface ArtifactIntegrityVerificationRequest {
  readonly subject: PackageTrustSubject
  readonly acquisitionAuthorization: AcquisitionAuthorization
  readonly handle: InertArtifactHandle
  readonly expectedIntegrityEvidence: ExpectedIntegrityEvidence
  readonly evaluatedAt: string
}

export class ArtifactIntegrityVerifier {
  private readonly validator = new IntegrityEvidenceValidator()
  private readonly computer = new DigestComputer()
  private readonly comparator = new ConstantTimeDigestComparator()

  async verify(
    request: ArtifactIntegrityVerificationRequest,
    reader: ArtifactByteReader,
  ): Promise<IntegrityAssessment> {
    const { subject, acquisitionAuthorization, handle, expectedIntegrityEvidence, evaluatedAt } = request
    const expected = expectedIntegrityEvidence.expectedIntegrity

    const validationResult = this.validator.validate(
      subject,
      acquisitionAuthorization,
      handle,
      expectedIntegrityEvidence,
      evaluatedAt,
    )

    if (!validationResult.valid) {
      const reason = validationResult.reason === 'authorization-expired' || validationResult.reason === 'authority-invalid'
        ? 'subject-mismatch'
        : validationResult.reason
      return { passed: false, expectedIntegrity: expected, reason }
    }

    const computationResult = await this.computer.compute(
      handle,
      reader,
      expected.algorithm,
      expected.encoding,
    )

    if (!computationResult.computed) {
      return { passed: false, expectedIntegrity: expected, reason: 'artifact-read-failed' }
    }

    const observed = computationResult.digest
    const comparison = this.comparator.compare(expected, observed)

    if (!comparison.matched) {
      if (comparison.reason === 'malformed' || comparison.reason === 'length-mismatch') {
        return { passed: false, expectedIntegrity: expected, reason: 'digest-format-invalid' }
      }
      return { passed: false, expectedIntegrity: expected, observedIntegrity: observed, reason: 'integrity-mismatch' }
    }

    return { passed: true, expectedIntegrity: expected, observedIntegrity: observed }
  }
}
