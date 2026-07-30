import type { PackageTrustDecision } from '@rohinik-org/package-trust-ir'
import type {
  PackageTrustDecisionRequest,
  TrustDecisionResult,
} from '@rohinik-org/package-trust-decision'
import type {
  PackageTrustRepository,
  RecordTrustDecisionCommand,
  RepositoryWriteReceipt,
} from '@rohinik-org/package-trust-repository'
import type {
  PackageQuarantineRequest,
  PackageQuarantineResult,
} from '@rohinik-org/package-quarantine'
import type {
  PackageTrustReevaluationTrigger,
  PackageTrustReevaluationPolicy,
  ReevaluationBatchResult,
} from '@rohinik-org/package-trust-reevaluation'
import type {
  PackageProvisioningAuthorizationRequest,
  PackageProvisioningAuthorizationPolicy,
  AuthorizationController,
  AuthorizationControllerResult,
} from '@rohinik-org/package-provisioning-authorization'
import { TrustDecisionEngine } from '@rohinik-org/package-trust-decision'
import { QuarantineController } from '@rohinik-org/package-quarantine'
import { ReevaluationController } from '@rohinik-org/package-trust-reevaluation'
import { createAuthorizationController } from '@rohinik-org/package-provisioning-authorization'

export interface Stage9JSystemHarnessConfig {
  readonly repository: PackageTrustRepository
  readonly quarantineController: QuarantineController
  readonly reevaluationController: ReevaluationController
  readonly authorizationController: AuthorizationController
}

export class Stage9JSystemHarness {
  private readonly trustEngine = new TrustDecisionEngine()

  constructor(private readonly config: Stage9JSystemHarnessConfig) {}

  decide(request: PackageTrustDecisionRequest): TrustDecisionResult {
    return this.trustEngine.decide(request)
  }

  async persist(cmd: RecordTrustDecisionCommand): Promise<RepositoryWriteReceipt> {
    return this.config.repository.recordTrustDecision(cmd)
  }

  async quarantine(request: PackageQuarantineRequest): Promise<PackageQuarantineResult> {
    return this.config.quarantineController.quarantine(request)
  }

  async reevaluate(
    triggers: readonly PackageTrustReevaluationTrigger[],
    policy: PackageTrustReevaluationPolicy,
    requestedAt: string,
  ): Promise<ReevaluationBatchResult> {
    return this.config.reevaluationController.reevaluate(triggers, policy, requestedAt)
  }

  async authorizeProvisioning(
    request: PackageProvisioningAuthorizationRequest,
    policy: PackageProvisioningAuthorizationPolicy,
    declaredCapabilities: string[],
    declaredPermissions: string[],
    requestedAt: string,
  ): Promise<AuthorizationControllerResult> {
    return this.config.authorizationController.authorize(
      request, policy, declaredCapabilities, declaredPermissions, requestedAt,
    )
  }

  get repository(): PackageTrustRepository {
    return this.config.repository
  }
}
