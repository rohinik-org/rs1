import type {
  AcquisitionAuthorization,
  PackageTrustSubject,
  ExternalSourceIdentity,
  InertArtifactHandle,
} from '@rohinik-org/package-trust-ir'
import { AcquisitionAuthorizer } from './acquisition-authorizer.js'
import { InertStagingManager } from './inert-staging-manager.js'

export type ArtifactFetcher = (
  subject: PackageTrustSubject,
  sourceIdentity: ExternalSourceIdentity,
) => Promise<{ filename: string; bytes: Uint8Array }>

export type AcquisitionResult =
  | { readonly acquired: true; readonly handle: InertArtifactHandle }
  | { readonly acquired: false; readonly reason: string }

export class AcquisitionService {
  private readonly authorizer = new AcquisitionAuthorizer()

  constructor(private readonly stagingManager: InertStagingManager) {}

  async acquire(
    authorization: AcquisitionAuthorization,
    subject: PackageTrustSubject,
    sourceIdentity: ExternalSourceIdentity,
    fetcher: ArtifactFetcher,
  ): Promise<AcquisitionResult> {
    const outcome = this.authorizer.authorize(authorization, subject, sourceIdentity)
    if (!outcome.authorized) {
      return { acquired: false, reason: outcome.reason }
    }

    const { filename, bytes } = await fetcher(subject, sourceIdentity)
    const allocation = await this.stagingManager.allocate(filename)
    await this.stagingManager.writeBytes(allocation, bytes)

    const handle = this.stagingManager.buildHandle(
      allocation,
      subject,
      bytes.byteLength,
      sourceIdentity,
    )

    return { acquired: true, handle }
  }
}
