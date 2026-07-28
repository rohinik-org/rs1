import type {
  DeliveredEnvironmentSnapshotAssembler,
  DeliveredEnvironmentAssemblyInput,
  DeliveredEnvironmentSnapshot,
} from '@rohinik-org/lockfile-ir'
import { SnapshotAdmissionError } from '@rohinik-org/lockfile-ir'
import type {
  ManagedProvisioningResult,
  AuthorizedCapabilityResolutionPlan,
  AuthorizedArtifactSource,
} from '@rohinik-org/provisioning-ir'
import type {
  LockedPackage, LockedNpmEnvironment, LockedModelArtifact,
  LockedInfrastructure, LockedProvider, LockedConfigurationRecord,
  LockedCapabilityBinding, LockedArtifactSource, LockedIntegrity,
} from '@rohinik-org/lockfile-ir'

export class SnapshotAssemblerImpl implements DeliveredEnvironmentSnapshotAssembler {
  async assemble(input: DeliveredEnvironmentAssemblyInput): Promise<DeliveredEnvironmentSnapshot> {
    const { plan, result, resolution } = input

    // Only ManagedProvisioningResult can produce a delivered snapshot
    if (result.mode !== 'managed') {
      throw new SnapshotAdmissionError(`Provisioning result mode must be 'managed', got '${result.mode}'`)
    }
    const managed = result as ManagedProvisioningResult

    // 10 admission conditions (AFS-0110 §21)
    if (managed.status !== 'success') {
      throw new SnapshotAdmissionError(`Provisioning result status must be 'success', got '${managed.status}'`)
    }

    for (const ar of managed.actionResults) {
      if (ar.state === 'failed') {
        throw new SnapshotAdmissionError(`Action ${ar.actionId} has state 'failed'`)
      }
      if (ar.state === 'compensation-failed') {
        throw new SnapshotAdmissionError(`Action ${ar.actionId} has state 'compensation-failed'`)
      }
    }

    for (const prov of managed.providers) {
      if (prov.state !== 'ready') {
        throw new SnapshotAdmissionError(`Provider '${prov.providerId}' is not in state 'ready' (got '${prov.state}')`)
      }
    }

    if (!managed.semanticJournalHash) {
      throw new SnapshotAdmissionError('Provisioning result is missing semanticJournalHash')
    }

    const snapshot: DeliveredEnvironmentSnapshot = {
      kind: 'delivered-environment-snapshot',
      snapshotVersion: 1,
      application: {
        applicationId: plan.authorizationId,
        manifestSemanticHash: plan.semanticHash,
        manifestSchemaVersion: plan.schemaVersion,
      },
      runtime: {
        os: process.platform,
        architecture: process.arch,
        runtimeKind: 'nodejs',
        runtimeVersion: process.version.slice(1),
      },
      resolution,
      capabilities: extractCapabilities(plan),
      packages: extractRohinikPackages(plan),
      dependencies: extractDependencies(plan),
      models: extractModels(plan),
      infrastructure: extractInfrastructure(plan),
      providers: extractProviders(plan, managed),
      configuration: extractConfiguration(plan),
      policies: {
        trustPolicySemanticHash: resolution.resolutionPolicySemanticHash,
        permissionPolicySemanticHash: resolution.authorizedPlanSemanticHash,
        authorizationPolicySemanticHash: resolution.authorizationId,
      },
      provisioningEvidence: {
        executionId: managed.executionId,
        status: 'success',
        semanticJournalHash: managed.semanticJournalHash,
        auditJournalHash: managed.auditJournalHash,
      },
    }

    return snapshot
  }
}

// ── Extraction helpers ────────────────────────────────────────────────────────

function extractRohinikPackages(plan: AuthorizedCapabilityResolutionPlan): readonly LockedPackage[] {
  const packages: LockedPackage[] = []
  for (const action of plan.authorizedActions) {
    if (action.kind !== 'install-rohinik-package') continue
    const artifact = plan.verifiedArtifacts.find(a =>
      a.artifact.kind === 'rohinik-package' && a.artifact.packageId === action.packageId
    )
    if (!artifact) continue
    packages.push({
      packageId: action.packageId,
      version: action.version,
      integrity: artifact.digest as LockedIntegrity,
      source: convertSource(artifact.source),
      packageStoreIdentity: { relativeLocation: action.destination },
    })
  }
  return packages
}

function extractDependencies(plan: AuthorizedCapabilityResolutionPlan): DeliveredEnvironmentSnapshot['dependencies'] {
  if (plan.npmInstallManifests.length === 0) return {}
  // ponytail: first manifest only; multi-workspace deferred
  const m = plan.npmInstallManifests[0]!
  const npmEnv: LockedNpmEnvironment = {
    packageJsonSemanticHash: m.packageJsonSemanticHash,
    packageLockSemanticHash: m.packageLockSemanticHash,
    lockfileVersion: m.lockfileVersion,
    nodeVersion: process.version.slice(1),
    npmVersion: '',
    packages: m.packageRecords.map(r => ({
      packagePath: r.packagePath,
      name: r.name,
      version: r.version,
      integrity: r.integrity as LockedIntegrity,
      source: convertSource(r.resolvedArtifact),
      disposition: r.expectedDisposition,
      optional: r.optional,
      dev: r.dev,
    })),
  }
  return { npm: npmEnv }
}

function extractModels(plan: AuthorizedCapabilityResolutionPlan): readonly LockedModelArtifact[] {
  const models: LockedModelArtifact[] = []
  for (const action of plan.authorizedActions) {
    if (action.kind !== 'install-model-artifact') continue
    const artifact = plan.verifiedArtifacts.find(a =>
      a.artifact.kind === 'model-artifact' && a.artifact.modelId === action.modelId
    )
    if (!artifact) continue
    models.push({
      modelId: action.modelId,
      version: action.version,
      integrity: artifact.digest as LockedIntegrity,
      source: convertSource(artifact.source),
    })
  }
  return models
}

function extractInfrastructure(plan: AuthorizedCapabilityResolutionPlan): readonly LockedInfrastructure[] {
  const infra: LockedInfrastructure[] = []
  for (const action of plan.authorizedActions) {
    if (action.kind !== 'provision-infrastructure') continue
    infra.push({
      serviceId: action.serviceId,
      serviceType: action.serviceType,
      strategy: action.strategy,
    })
  }
  return infra
}

function extractProviders(
  plan: AuthorizedCapabilityResolutionPlan,
  result: ManagedProvisioningResult,
): readonly LockedProvider[] {
  const providers: LockedProvider[] = []
  for (const action of plan.authorizedActions) {
    if (action.kind !== 'register-provider') continue
    const pResult = result.providers.find(p => p.providerId === action.providerId)
    if (!pResult || pResult.state !== 'ready') continue
    providers.push({
      providerId: action.providerId,
      version: pResult.version,
      packageId: action.packageId,
      packageVersion: action.packageVersion,
      state: 'ready',
      registryPointer: '',
      capabilityIds: action.capabilityIds,
      validationEvidence: [],
    })
  }
  return providers
}

function extractConfiguration(plan: AuthorizedCapabilityResolutionPlan): readonly LockedConfigurationRecord[] {
  const config: LockedConfigurationRecord[] = []
  for (const action of plan.authorizedActions) {
    if (action.kind !== 'apply-configuration-template') continue
    const t = action.template
    const secretNames = action.secretRequirements.map(s => s.secretName)
    config.push({
      configurationKey: t.configurationKey,
      templateId: t.templateId,
      destination: t.destination,
      contentSemanticHash: t.contentSemanticHash,
      writePolicy: t.writePolicy,
      requiredSecretNames: secretNames,
    })
  }
  return config
}

function extractCapabilities(plan: AuthorizedCapabilityResolutionPlan): readonly LockedCapabilityBinding[] {
  const capabilities: LockedCapabilityBinding[] = []
  for (const action of plan.authorizedActions) {
    if (action.kind !== 'activate-provider') continue
    const { activation } = action
    for (const capId of activation.capabilityIds) {
      capabilities.push({
        capabilityId: capId,
        requirement: {},
        resolvedContractVersion: '1.0.0',
        providerId: activation.providerId,
        providerVersion: activation.version,
        packageId: activation.packageId,
        packageVersion: activation.version,
      })
    }
  }
  return capabilities
}

function convertSource(source: AuthorizedArtifactSource): LockedArtifactSource {
  if (source.sourceKind === 'uri') {
    return { sourceKind: 'authorized-uri', sourceIdentity: source.uri }
  }
  if (source.sourceKind === 'registry') {
    return { sourceKind: 'registry', registryId: source.registryId, artifactLocator: source.artifactLocator }
  }
  // workspace-artifact
  return { sourceKind: 'workspace-artifact', workspaceArtifactId: source.path, relativePath: source.path }
}
