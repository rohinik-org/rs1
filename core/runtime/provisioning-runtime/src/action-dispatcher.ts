import type {
  AuthorizedProvisioningAction,
  AuthorizedCapabilityResolutionPlan,
  ArtifactFetchPort,
  ArtifactDigestMatchPort,
  PackageInstallPort,
  LanguageDependencyApplyPort,
  MutationJournalPort,
  ProvisioningActionState,
  ProvisioningDiagnosticCode,
  ProvisioningDiagnosticId,
  ProviderProvisioningResult,
  ProvisioningWorkspace,
  InstalledProviderHandle,
  ArtifactAuthorizationId,
  QuarantineWriteHandle,
  IsoTimestamp,
} from '@rohinik-org/provisioning-ir'
import type { ProviderValidator } from './provider-validator.js'
import type { ConfigurationCoordinator } from './configuration-coordinator.js'

export interface ActionDispatchResult {
  readonly state: ProvisioningActionState
  readonly diagnosticCodes: readonly ProvisioningDiagnosticCode[]
  readonly diagnosticIds: readonly ProvisioningDiagnosticId[]
  readonly durationMs: number
  readonly instantiatedProvider?: ProviderProvisioningResult
}

export class ActionDispatcher {
  // Tracks registered providers for validate/activate lookups
  private readonly providerRegistry = new Map<string, InstalledProviderHandle>()
  // Tracks validation results keyed by providerId
  private readonly validationResults = new Map<string, boolean>()

  constructor(
    private readonly packageInstaller: PackageInstallPort,
    private readonly languageDependencyExecutor: LanguageDependencyApplyPort,
    private readonly providerValidator: ProviderValidator,
    private readonly configurationCoordinator: ConfigurationCoordinator,
    private readonly fetchPort: ArtifactFetchPort,
    private readonly digestMatchPort: ArtifactDigestMatchPort,
    private readonly plan: AuthorizedCapabilityResolutionPlan,
    private readonly workspace: ProvisioningWorkspace,
    private readonly clock: () => IsoTimestamp,
  ) {}

  async dispatch(action: AuthorizedProvisioningAction, journal: MutationJournalPort): Promise<ActionDispatchResult> {
    const start = Date.now()
    try {
      const result = await this.doDispatch(action, journal)
      return { ...result, durationMs: Date.now() - start }
    } catch (err) {
      const codes: ProvisioningDiagnosticCode[] = [
        (err instanceof Error ? err.message.slice(0, 64) : String(err)) as ProvisioningDiagnosticCode,
      ]
      return {
        state: 'failed',
        diagnosticCodes: codes,
        diagnosticIds: [],
        durationMs: Date.now() - start,
      }
    }
  }

  private async doDispatch(action: AuthorizedProvisioningAction, journal: MutationJournalPort): Promise<Omit<ActionDispatchResult, 'durationMs'>> {
    switch (action.kind) {
      case 'fetch-artifact': {
        const authorization = this.plan.verifiedArtifacts.find(
          a => a.artifactAuthorizationId === action.artifactAuthorizationId,
        )
        if (!authorization) throw new Error(`fetch-artifact: no verifiedArtifact for id ${action.artifactAuthorizationId}`)
        const writeHandle: QuarantineWriteHandle = {
          quarantinePath: `${this.workspace.quarantineRoot}/${action.artifactAuthorizationId}` as ArtifactAuthorizationId as never,
          artifactAuthorizationId: action.artifactAuthorizationId,
        }
        const fetchResult = await this.fetchPort.fetch(authorization.source, writeHandle)
        const matchResult = await this.digestMatchPort.matchFile(fetchResult.quarantineHandle, authorization)
        if (!matchResult.matched) {
          return {
            state: 'failed',
            diagnosticCodes: ['ARTIFACT_DIGEST_MISMATCH' as ProvisioningDiagnosticCode],
            diagnosticIds: [matchResult.diagnosticId],
          }
        }
        return { state: 'succeeded', diagnosticCodes: [], diagnosticIds: [] }
      }

      case 'install-rohinik-package': {
        const authorization = this.plan.verifiedArtifacts.find(
          a => a.artifactAuthorizationId === action.artifactAuthorizationId,
        )
        if (!authorization) throw new Error(`install-rohinik-package: no verifiedArtifact for id ${action.artifactAuthorizationId}`)
        await this.packageInstaller.install(action, authorization, this.workspace, journal)
        return { state: 'succeeded', diagnosticCodes: [], diagnosticIds: [] }
      }

      case 'install-language-package': {
        const manifest = this.plan.npmInstallManifests.find(m => m.semanticHash === action.npmManifestHash)
        if (!manifest) throw new Error(`install-language-package: no manifest for hash ${action.npmManifestHash}`)
        await this.languageDependencyExecutor.apply(manifest, this.workspace, journal)
        return { state: 'succeeded', diagnosticCodes: [], diagnosticIds: [] }
      }

      case 'install-model-artifact': {
        const authorization = this.plan.verifiedArtifacts.find(
          a => a.artifactAuthorizationId === action.artifactAuthorizationId,
        )
        if (!authorization) throw new Error(`install-model-artifact: no verifiedArtifact for id ${action.artifactAuthorizationId}`)
        // ponytail: install-model-artifact defers to package installer in Stage 9H; model-specific port in 9I
        await this.packageInstaller.install(action as never, authorization, this.workspace, journal)
        return { state: 'succeeded', diagnosticCodes: [], diagnosticIds: [] }
      }

      case 'provision-infrastructure': {
        // ponytail: no-op stub — Stage 9H deferred; infrastructure provisioning in Stage 9K
        return { state: 'succeeded', diagnosticCodes: [], diagnosticIds: [] }
      }

      case 'apply-configuration-template': {
        const result = await this.configurationCoordinator.apply(action, this.workspace, journal)
        const state: ProvisioningActionState = result.failed.length > 0 ? 'failed' : 'succeeded'
        const codes = result.failed.length > 0
          ? ['CONFIGURATION_APPLY_FAILED' as ProvisioningDiagnosticCode]
          : []
        return { state, diagnosticCodes: codes, diagnosticIds: [] }
      }

      case 'register-provider': {
        const handle: InstalledProviderHandle = {
          providerId: action.providerId,
          packageId: action.packageId,
          version: action.packageVersion,
          installPath: `${this.workspace.packageStoreRoot}/${action.packageId}` as never,
        }
        this.providerRegistry.set(action.providerId, handle)
        const provider: ProviderProvisioningResult = {
          providerId: action.providerId,
          packageId: action.packageId,
          version: action.packageVersion,
          state: 'installed-inactive',
        }
        return { state: 'succeeded', diagnosticCodes: [], diagnosticIds: [], instantiatedProvider: provider }
      }

      case 'validate-provider': {
        const handle = this.providerRegistry.get(action.providerId)
        if (!handle) throw new Error(`validate-provider: provider '${action.providerId}' not registered`)
        const validationResult = await this.providerValidator.validate(action, handle)
        this.validationResults.set(action.providerId, validationResult.passed)
        if (!validationResult.passed) {
          return {
            state: 'failed',
            diagnosticCodes: validationResult.diagnosticCodes,
            diagnosticIds: [],
          }
        }
        return { state: 'succeeded', diagnosticCodes: [], diagnosticIds: [] }
      }

      case 'activate-provider': {
        const handle = this.providerRegistry.get(action.activation.providerId)
        if (!handle) throw new Error(`activate-provider: provider '${action.activation.providerId}' not registered`)
        const validated = this.validationResults.get(action.activation.providerId) ?? false
        const providerState = validated ? 'ready' : 'activation-failed'
        const provider: ProviderProvisioningResult = {
          providerId: action.activation.providerId,
          packageId: action.activation.packageId,
          version: action.activation.version,
          state: providerState,
        }
        return {
          state: validated ? 'succeeded' : 'failed',
          diagnosticCodes: validated ? [] : ['PROVIDER_NOT_VALIDATED' as ProvisioningDiagnosticCode],
          diagnosticIds: [],
          instantiatedProvider: provider,
        }
      }

      default: {
        // TypeScript exhaustion guard
        const _exhaustive: never = action
        throw new Error(`ActionDispatcher: unhandled action kind '${(_exhaustive as { kind: string }).kind}'`)
      }
    }
  }
}
