import { describe, it, expect, vi } from 'vitest'
import type {
  AuthorizedCapabilityResolutionPlan,
  AuthorizedInstallRohinikPackageAction,
  AuthorizedInstallLanguagePackagesAction,
  AuthorizedInstallModelArtifactAction,
  AuthorizedApplyConfigurationAction,
  AuthorizedValidateProviderAction,
  AuthorizedRegisterProviderAction,
  AuthorizedActivateProviderAction,
  AuthorizedFetchArtifactAction,
  AuthorizedProvisionInfrastructureAction,
  PackageInstallPort,
  LanguageDependencyApplyPort,
  ArtifactFetchPort,
  ArtifactDigestMatchPort,
  MutationJournalPort,
  ProvisioningWorkspace,
  ProvisioningActionId,
  AuthorizationId,
  AuthorizationDecisionId,
  ArtifactAuthorizationId,
  NpmInstallManifestHash,
  ResolutionPlanId,
  ResolutionPlanSemanticHash,
  PackageId,
  IsoTimestamp,
  WorkspaceRoot,
  WorkspaceRelativePath,
  PackageStoreLocation,
  ProvisioningDiagnosticId,
} from '@rohinik-org/provisioning-ir'
import { AuthorizationProofStore } from '../authorization-proof-store.js'
import { canonicalize, sha256Hex } from '../canonicalize.js'
import type { AuthorizedPlanSemanticHash } from '@rohinik-org/provisioning-ir'
import { ActionDispatcher } from '../action-dispatcher.js'
import { ProviderValidator } from '../provider-validator.js'
import { ConfigurationCoordinator } from '../configuration-coordinator.js'

// ── type helpers ──────────────────────────────────────────────────────────────

const aid = (s: string) => s as ProvisioningActionId
const authId = (s: string) => s as AuthorizationId
const decId = (s: string) => s as AuthorizationDecisionId
const artifactId = (s: string) => s as ArtifactAuthorizationId
const pkgId = (s: string) => s as PackageId
const now = () => '2026-01-01T00:00:00.000Z' as IsoTimestamp

// ── minimal plan builder ──────────────────────────────────────────────────────

function buildMinimalPlan(overrides: Partial<AuthorizedCapabilityResolutionPlan> = {}): AuthorizedCapabilityResolutionPlan {
  const base = {
    kind: 'authorized-capability-resolution-plan' as const,
    schemaVersion: 1 as const,
    authorizationId: 'auth-001' as AuthorizationId,
    proposedPlanId: 'plan-001' as ResolutionPlanId,
    proposedPlanSemanticHash: 'abc' as ResolutionPlanSemanticHash,
    authorizedAt: '2026-01-01T00:00:00.000Z' as IsoTimestamp,
    authorizationPolicyId: 'policy-1',
    authorizedActions: [],
    verifiedArtifacts: [],
    permissionAuthorizations: [],
    npmInstallManifests: [],
    secretRequirements: [],
    ...overrides,
  }
  const semanticHash = sha256Hex(canonicalize(base)) as AuthorizedPlanSemanticHash
  return {
    ...base,
    semanticHash,
    authorizationProof: {
      algorithm: 'in-process-token',
      issuer: 'issuer-1' as never,
      signedPayloadHash: semanticHash,
      token: 'tok-1',
    },
  } as AuthorizedCapabilityResolutionPlan
}

// ── minimal workspace ─────────────────────────────────────────────────────────

const WORKSPACE: ProvisioningWorkspace = {
  workspaceId: 'ws-test',
  root: '/tmp/ws' as WorkspaceRoot,
  quarantineRoot: '.rohinik/quarantine' as WorkspaceRelativePath,
  stagingRoot: '.rohinik/staging' as WorkspaceRelativePath,
  packageStoreRoot: '.rohinik/packages' as WorkspaceRelativePath,
  modelStoreRoot: '.rohinik/models' as WorkspaceRelativePath,
}

// ── null journal ──────────────────────────────────────────────────────────────

function nullJournal(): MutationJournalPort {
  return {
    prepareMutation: vi.fn(),
    startMutation: vi.fn(),
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
    recordValidationStarted: vi.fn(),
    recordValidationSucceeded: vi.fn(),
    recordValidationFailed: vi.fn(),
  }
}

// ── base action fields ────────────────────────────────────────────────────────

const BASE_ACTION = {
  actionId: aid('a1'),
  dependsOn: [],
  authorization: {
    authorizationId: authId('auth-001'),
    authorizationDecisionId: decId('dec-1'),
    authorizedTargetHash: 'hash',
  },
}

// ── dispatcher factory ────────────────────────────────────────────────────────

function makeDispatcher(
  plan: AuthorizedCapabilityResolutionPlan,
  overrides: {
    packageInstaller?: PackageInstallPort
    languageDependencyExecutor?: LanguageDependencyApplyPort
    fetchPort?: ArtifactFetchPort
    digestMatchPort?: ArtifactDigestMatchPort
    providerValidator?: ProviderValidator
    configurationCoordinator?: ConfigurationCoordinator
  } = {},
): ActionDispatcher {
  const packageInstaller: PackageInstallPort = overrides.packageInstaller ?? {
    install: vi.fn().mockResolvedValue({ installedPath: '/tmp/pkg' as PackageStoreLocation }),
  }
  const languageDependencyExecutor: LanguageDependencyApplyPort = overrides.languageDependencyExecutor ?? {
    apply: vi.fn().mockResolvedValue({ ecosystem: 'npm', installedCount: 0, durationMs: 1 }),
  }
  const fetchPort: ArtifactFetchPort = overrides.fetchPort ?? {
    fetch: vi.fn().mockResolvedValue({
      bytesWritten: 100,
      quarantineHandle: { quarantinePath: '/tmp/q/art-1', artifactAuthorizationId: artifactId('art-1') },
      effectiveSource: { sourceKind: 'uri', uri: 'https://example.com/pkg.tar.gz' },
    }),
  }
  const digestMatchPort: ArtifactDigestMatchPort = overrides.digestMatchPort ?? {
    matchStream: vi.fn().mockResolvedValue({ matched: true }),
    matchFile: vi.fn().mockResolvedValue({ matched: true }),
  }
  const providerValidator = overrides.providerValidator ?? new ProviderValidator()
  const configurationCoordinator = overrides.configurationCoordinator ?? new ConfigurationCoordinator('/tmp', now)

  return new ActionDispatcher(
    packageInstaller,
    languageDependencyExecutor,
    providerValidator,
    configurationCoordinator,
    fetchPort,
    digestMatchPort,
    plan,
    WORKSPACE,
    now,
  )
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ActionDispatcher', () => {
  describe('install-rohinik-package', () => {
    it('calls packageInstaller.install() and returns succeeded', async () => {
      const installFn = vi.fn().mockResolvedValue({ installedPath: '/tmp/pkg' as PackageStoreLocation })
      const plan = buildMinimalPlan({
        verifiedArtifacts: [
          {
            artifactAuthorizationId: artifactId('art-1'),
            artifact: { kind: 'rohinik-package', packageId: pkgId('pkg-a'), version: '1.0.0' },
            digest: { algorithm: 'sha256', encoding: 'hex', value: 'a'.repeat(64) },
            source: { sourceKind: 'uri', uri: 'https://example.com/pkg.tar.gz' },
            authorizedBy: authId('auth-001'),
          },
        ],
      })
      const action: AuthorizedInstallRohinikPackageAction = {
        ...BASE_ACTION,
        kind: 'install-rohinik-package',
        packageId: pkgId('pkg-a'),
        version: '1.0.0',
        artifactAuthorizationId: artifactId('art-1'),
        destination: '/store/pkg-a' as PackageStoreLocation,
        quarantineRetentionPolicy: 'delete-on-validation-failure',
        mutationPolicy: { mutating: true, compensation: { kind: 'remove-dir', parameters: { path: '/store/pkg-a' } } },
      }
      const dispatcher = makeDispatcher(plan, { packageInstaller: { install: installFn } })
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(installFn).toHaveBeenCalledOnce()
    })
  })

  describe('install-language-package', () => {
    it('calls languageDependencyExecutor.apply() and returns succeeded', async () => {
      const applyFn = vi.fn().mockResolvedValue({ ecosystem: 'npm', installedCount: 2, durationMs: 50 })
      const manifestHash = 'manifest-hash-1' as NpmInstallManifestHash
      const plan = buildMinimalPlan({
        npmInstallManifests: [
          {
            ecosystem: 'npm',
            lockfileVersion: 3,
            packageJsonCanonicalContent: '{}',
            packageJsonSemanticHash: 'pjsh',
            packageLockCanonicalContent: '{}',
            packageLockSemanticHash: 'plsh',
            packageRecords: [],
            semanticHash: manifestHash,
          },
        ],
      })
      const action: AuthorizedInstallLanguagePackagesAction = {
        ...BASE_ACTION,
        kind: 'install-language-package',
        ecosystem: 'npm',
        npmManifestHash: manifestHash,
        existingNodeModulesPolicy: 'require-absent',
        mutationPolicy: { mutating: true, compensation: { kind: 'remove-dir', parameters: { path: '/node_modules' } } },
      }
      const dispatcher = makeDispatcher(plan, { languageDependencyExecutor: { apply: applyFn } })
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(applyFn).toHaveBeenCalledOnce()
    })
  })

  describe('install-model-artifact', () => {
    it('calls packageInstaller.install() and returns succeeded', async () => {
      const installFn = vi.fn().mockResolvedValue({ installedPath: '/tmp/model' as PackageStoreLocation })
      const plan = buildMinimalPlan({
        verifiedArtifacts: [
          {
            artifactAuthorizationId: artifactId('art-model-1'),
            artifact: { kind: 'model-artifact', registryId: 'reg-1', modelId: 'model-a', version: '1.0.0' },
            digest: { algorithm: 'sha256', encoding: 'hex', value: 'e'.repeat(64) },
            source: { sourceKind: 'uri', uri: 'https://example.com/model.bin' },
            authorizedBy: authId('auth-001'),
          },
        ],
      })
      const action: AuthorizedInstallModelArtifactAction = {
        ...BASE_ACTION,
        kind: 'install-model-artifact',
        modelId: 'model-a',
        version: '1.0.0',
        artifactAuthorizationId: artifactId('art-model-1'),
        mutationPolicy: { mutating: true, compensation: { kind: 'remove-dir', parameters: { path: '/store/model-a' } } },
      }
      const dispatcher = makeDispatcher(plan, { packageInstaller: { install: installFn } })
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(installFn).toHaveBeenCalledOnce()
    })
  })

  describe('apply-configuration-template', () => {
    it('calls configurationCoordinator.apply() and returns succeeded when no failures', async () => {
      const applyFn = vi.fn().mockResolvedValue({ applied: ['key-1'], skipped: [], failed: [] })
      const mockCoordinator = { apply: applyFn } as unknown as ConfigurationCoordinator
      const plan = buildMinimalPlan()
      const action: AuthorizedApplyConfigurationAction = {
        ...BASE_ACTION,
        kind: 'apply-configuration-template',
        template: {
          templateId: 'tmpl-1',
          configurationKey: 'key-1',
          destination: 'config/key.yaml' as WorkspaceRelativePath,
          valueType: 'string',
          canonicalContent: 'value: hello',
          contentSemanticHash: 'csh',
          writePolicy: 'validate-only',
        },
        secretRequirements: [],
        mutationPolicy: { mutating: false },
      }
      const dispatcher = makeDispatcher(plan, { configurationCoordinator: mockCoordinator })
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(applyFn).toHaveBeenCalledOnce()
    })
  })

  describe('validate-provider', () => {
    it('returns succeeded when validation passes', async () => {
      const validateFn = vi.fn().mockResolvedValue({ passed: true, diagnosticCodes: [] })
      const mockValidator = { validate: validateFn } as unknown as ProviderValidator
      const plan = buildMinimalPlan()

      // First register provider so registry has it
      const registerAction: AuthorizedRegisterProviderAction = {
        ...BASE_ACTION,
        actionId: aid('a0'),
        kind: 'register-provider',
        providerId: 'my-provider',
        packageId: pkgId('pkg-provider'),
        packageVersion: '1.0.0',
        capabilityIds: [],
        mutationPolicy: { mutating: true, compensation: { kind: 'deregister', parameters: {} } },
      }
      const validateAction: AuthorizedValidateProviderAction = {
        ...BASE_ACTION,
        kind: 'validate-provider',
        providerId: 'my-provider',
        probe: { kind: 'manifest-check' },
        mutationPolicy: { mutating: false },
      }
      const dispatcher = makeDispatcher(plan, { providerValidator: mockValidator })
      await dispatcher.dispatch(registerAction, nullJournal())
      const result = await dispatcher.dispatch(validateAction, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(validateFn).toHaveBeenCalledOnce()
    })

    it('returns failed when validation fails', async () => {
      const validateFn = vi.fn().mockResolvedValue({ passed: false, diagnosticCodes: ['PROVIDER_MANIFEST_MISSING'] })
      const mockValidator = { validate: validateFn } as unknown as ProviderValidator
      const plan = buildMinimalPlan()
      const registerAction: AuthorizedRegisterProviderAction = {
        ...BASE_ACTION,
        actionId: aid('a0'),
        kind: 'register-provider',
        providerId: 'my-provider',
        packageId: pkgId('pkg-provider'),
        packageVersion: '1.0.0',
        capabilityIds: [],
        mutationPolicy: { mutating: true, compensation: { kind: 'deregister', parameters: {} } },
      }
      const validateAction: AuthorizedValidateProviderAction = {
        ...BASE_ACTION,
        kind: 'validate-provider',
        providerId: 'my-provider',
        probe: { kind: 'manifest-check' },
        mutationPolicy: { mutating: false },
      }
      const dispatcher = makeDispatcher(plan, { providerValidator: mockValidator })
      await dispatcher.dispatch(registerAction, nullJournal())
      const result = await dispatcher.dispatch(validateAction, nullJournal())
      expect(result.state).toBe('failed')
      expect(result.diagnosticCodes).toContain('PROVIDER_MANIFEST_MISSING')
    })
  })

  describe('register-provider', () => {
    it('returns succeeded and instantiatedProvider', async () => {
      const plan = buildMinimalPlan()
      const action: AuthorizedRegisterProviderAction = {
        ...BASE_ACTION,
        kind: 'register-provider',
        providerId: 'my-provider',
        packageId: pkgId('pkg-provider'),
        packageVersion: '1.0.0',
        capabilityIds: [],
        mutationPolicy: { mutating: true, compensation: { kind: 'deregister', parameters: {} } },
      }
      const dispatcher = makeDispatcher(plan)
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(result.instantiatedProvider).toBeDefined()
      expect(result.instantiatedProvider?.providerId).toBe('my-provider')
      expect(result.instantiatedProvider?.state).toBe('installed-inactive')
    })
  })

  describe('activate-provider', () => {
    it('returns succeeded + ProviderProvisioningResult when prior validation passed', async () => {
      const validateFn = vi.fn().mockResolvedValue({ passed: true, diagnosticCodes: [] })
      const mockValidator = { validate: validateFn } as unknown as ProviderValidator
      const plan = buildMinimalPlan()
      const providerId = 'my-provider'
      const registerAction: AuthorizedRegisterProviderAction = {
        ...BASE_ACTION,
        actionId: aid('a0'),
        kind: 'register-provider',
        providerId,
        packageId: pkgId('pkg-provider'),
        packageVersion: '1.0.0',
        capabilityIds: [],
        mutationPolicy: { mutating: true, compensation: { kind: 'deregister', parameters: {} } },
      }
      const validateAction: AuthorizedValidateProviderAction = {
        ...BASE_ACTION,
        actionId: aid('a1'),
        kind: 'validate-provider',
        providerId,
        probe: { kind: 'manifest-check' },
        mutationPolicy: { mutating: false },
      }
      const activateAction: AuthorizedActivateProviderAction = {
        ...BASE_ACTION,
        actionId: aid('a2'),
        kind: 'activate-provider',
        activation: {
          providerId,
          packageId: pkgId('pkg-provider'),
          version: '1.0.0',
          capabilityIds: [],
          activationMode: 'new',
        },
        mutationPolicy: { mutating: true, compensation: { kind: 'deactivate', parameters: {} } },
      }
      const dispatcher = makeDispatcher(plan, { providerValidator: mockValidator })
      await dispatcher.dispatch(registerAction, nullJournal())
      await dispatcher.dispatch(validateAction, nullJournal())
      const result = await dispatcher.dispatch(activateAction, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(result.instantiatedProvider).toBeDefined()
      expect(result.instantiatedProvider?.state).toBe('ready')
    })
  })

  describe('provision-infrastructure', () => {
    it('returns succeeded (no-op stub)', async () => {
      const plan = buildMinimalPlan()
      const action: AuthorizedProvisionInfrastructureAction = {
        ...BASE_ACTION,
        kind: 'provision-infrastructure',
        serviceId: 'svc-1',
        serviceType: 'local-process',
        strategy: 'reuse-existing',
        infrastructureCompensation: { kind: 'none', reason: 'reuse-existing' },
        mutationPolicy: { mutating: false },
      }
      const dispatcher = makeDispatcher(plan)
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('succeeded')
    })
  })

  describe('error handling', () => {
    it('returns failed state (no re-throw) when packageInstaller.install() throws', async () => {
      const throwingInstaller: PackageInstallPort = {
        install: vi.fn().mockRejectedValue(new Error('disk full')),
      }
      const plan = buildMinimalPlan({
        verifiedArtifacts: [
          {
            artifactAuthorizationId: artifactId('art-1'),
            artifact: { kind: 'rohinik-package', packageId: pkgId('pkg-a'), version: '1.0.0' },
            digest: { algorithm: 'sha256', encoding: 'hex', value: 'b'.repeat(64) },
            source: { sourceKind: 'uri', uri: 'https://example.com/pkg.tar.gz' },
            authorizedBy: authId('auth-001'),
          },
        ],
      })
      const action: AuthorizedInstallRohinikPackageAction = {
        ...BASE_ACTION,
        kind: 'install-rohinik-package',
        packageId: pkgId('pkg-a'),
        version: '1.0.0',
        artifactAuthorizationId: artifactId('art-1'),
        destination: '/store/pkg-a' as PackageStoreLocation,
        quarantineRetentionPolicy: 'delete-on-validation-failure',
        mutationPolicy: { mutating: true, compensation: { kind: 'remove-dir', parameters: {} } },
      }
      const dispatcher = makeDispatcher(plan, { packageInstaller: throwingInstaller })
      // Must not throw
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('failed')
      expect(result.diagnosticCodes).toHaveLength(1)
    })
  })

  describe('fetch-artifact', () => {
    it('calls fetchPort.fetch() and digestMatchPort.matchFile()', async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        bytesWritten: 100,
        quarantineHandle: { quarantinePath: '/tmp/q/art-1', artifactAuthorizationId: artifactId('art-1') },
        effectiveSource: { sourceKind: 'uri', uri: 'https://example.com/pkg.tar.gz' },
      })
      const matchFileFn = vi.fn().mockResolvedValue({ matched: true })
      const plan = buildMinimalPlan({
        verifiedArtifacts: [
          {
            artifactAuthorizationId: artifactId('art-1'),
            artifact: { kind: 'rohinik-package', packageId: pkgId('pkg-a'), version: '1.0.0' },
            digest: { algorithm: 'sha256', encoding: 'hex', value: 'c'.repeat(64) },
            source: { sourceKind: 'uri', uri: 'https://example.com/pkg.tar.gz' },
            authorizedBy: authId('auth-001'),
          },
        ],
      })
      const action: AuthorizedFetchArtifactAction = {
        ...BASE_ACTION,
        kind: 'fetch-artifact',
        artifactAuthorizationId: artifactId('art-1'),
        quarantineRetentionPolicy: 'delete-on-validation-failure',
        mutationPolicy: { mutating: true, compensation: { kind: 'delete-quarantine', parameters: {} } },
      }
      const dispatcher = makeDispatcher(plan, {
        fetchPort: { fetch: fetchFn },
        digestMatchPort: { matchStream: vi.fn(), matchFile: matchFileFn },
      })
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(result.state).toBe('succeeded')
      expect(fetchFn).toHaveBeenCalledOnce()
      expect(matchFileFn).toHaveBeenCalledOnce()
    })
  })

  describe('durationMs', () => {
    it('is present and >= 0 in all dispatch results', async () => {
      const plan = buildMinimalPlan()
      const action: AuthorizedProvisionInfrastructureAction = {
        ...BASE_ACTION,
        kind: 'provision-infrastructure',
        serviceId: 'svc-1',
        serviceType: 'local-process',
        strategy: 'reuse-existing',
        infrastructureCompensation: { kind: 'none', reason: 'reuse-existing' },
        mutationPolicy: { mutating: false },
      }
      const dispatcher = makeDispatcher(plan)
      const result = await dispatcher.dispatch(action, nullJournal())
      expect(typeof result.durationMs).toBe('number')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })
  })
})
