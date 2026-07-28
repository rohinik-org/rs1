import type {
  LockDriftDetector,
  RohinikLockfileV1,
  ObservedEnvironmentSnapshot,
  LockEnforcementMode,
  LockEnforcementPolicy,
  DriftReport,
  DriftEntry,
  LockDriftType,
  DriftSeverity,
} from '@rohinik-org/lockfile-ir'
import { buildSemanticProjection } from './semantic-projection.js'
import { semanticHash, auditHash } from './hasher.js'

// Integrity-critical drift types that are always security-error
const SECURITY_DRIFT: ReadonlySet<LockDriftType> = new Set([
  'package-integrity-drift',
  'dependency-integrity-drift',
  'model-integrity-drift',
  'lock-semantic-hash-invalid',
  'lock-audit-hash-invalid',
])

// These are always error regardless of mode
const ALWAYS_ERROR: ReadonlySet<LockDriftType> = new Set<LockDriftType>(['provider-not-ready'])

function severity(driftType: LockDriftType, mode: LockEnforcementMode): DriftSeverity {
  if (SECURITY_DRIFT.has(driftType)) return 'security-error'
  if (ALWAYS_ERROR.has(driftType)) return 'error'
  return mode === 'development' ? 'warning' : 'error'
}

function entry(
  driftType: LockDriftType,
  targetKind: DriftEntry['targetKind'],
  targetId: string,
  field: string,
  lockedValue: string | undefined,
  observedValue: string | undefined,
  mode: LockEnforcementMode,
): DriftEntry {
  const sev = severity(driftType, mode)
  const base = {
    driftType, targetKind, targetId, field, severity: sev,
    remediationCode: driftType.toUpperCase().replace(/-/g, '_'),
    remediationHint: `Run 'rhk lock generate' to regenerate the lockfile`,
  }
  // exactOptionalPropertyTypes: only spread defined values
  return {
    ...base,
    ...(lockedValue !== undefined ? { lockedValue } : {}),
    ...(observedValue !== undefined ? { observedValue } : {}),
  } as DriftEntry
}

function reportStatus(entries: readonly DriftEntry[]): DriftReport['status'] {
  if (entries.some(e => e.severity === 'security-error')) return 'security-conflict'
  if (entries.some(e => e.severity === 'error')) return 'conflict'
  if (entries.some(e => e.severity === 'warning')) return 'warning'
  return 'compliant'
}

export class LockDriftDetectorImpl implements LockDriftDetector {
  detect(
    locked: RohinikLockfileV1,
    observed: ObservedEnvironmentSnapshot,
    mode: LockEnforcementMode,
    _policy?: LockEnforcementPolicy,
  ): DriftReport {
    const entries: DriftEntry[] = []
    const add = (
      driftType: LockDriftType,
      targetKind: DriftEntry['targetKind'],
      targetId: string,
      field: string,
      lockedValue?: string,
      observedValue?: string,
    ) => entries.push(entry(driftType, targetKind, targetId, field, lockedValue, observedValue, mode))

    // ── Hash validation (before any comparison) ──────────────────────────────
    const projInput = {
      kind: locked.kind,
      lockVersion: locked.lockVersion,
      application: locked.application,
      runtime: locked.runtime,
      resolution: locked.resolution,
      capabilities: locked.capabilities,
      packages: locked.packages,
      dependencies: locked.dependencies,
      models: locked.models,
      infrastructure: locked.infrastructure,
      providers: locked.providers,
      configuration: locked.configuration,
      policies: locked.policies,
      ...(locked.extensions ? { extensions: locked.extensions } : {}),
    }
    const expectedSem = semanticHash(buildSemanticProjection(projInput))
    if (locked.semanticHash !== expectedSem) {
      add('lock-semantic-hash-invalid', 'lockfile', 'lockfile', 'semanticHash', locked.semanticHash, expectedSem)
    }
    const auditInput = { ...projInput, semanticHash: locked.semanticHash, audit: locked.audit }
    const expectedAudit = auditHash(auditInput)
    if (locked.auditHash !== expectedAudit) {
      add('lock-audit-hash-invalid', 'lockfile', 'lockfile', 'auditHash', locked.auditHash, expectedAudit)
    }

    // ── Application ──────────────────────────────────────────────────────────
    if (
      observed.application.manifestSemanticHash !== undefined &&
      locked.application.manifestSemanticHash !== observed.application.manifestSemanticHash
    ) {
      add('application-manifest-drift', 'application', locked.application.applicationId,
        'manifestSemanticHash', locked.application.manifestSemanticHash, observed.application.manifestSemanticHash)
    }

    // ── Capabilities ─────────────────────────────────────────────────────────
    const obsCaps = new Map(observed.capabilities.map(c => [c.capabilityId, c]))
    for (const lc of locked.capabilities) {
      const oc = obsCaps.get(lc.capabilityId)
      if (!oc) {
        add('capability-binding-missing', 'capability', lc.capabilityId, 'capabilityId', lc.capabilityId, undefined)
      } else {
        if (oc.providerId !== undefined && lc.providerId !== oc.providerId) {
          add('capability-provider-drift', 'capability', lc.capabilityId, 'providerId', lc.providerId, oc.providerId)
        }
        if (oc.resolvedContractVersion !== undefined && lc.resolvedContractVersion !== oc.resolvedContractVersion) {
          add('capability-contract-version-drift', 'capability', lc.capabilityId, 'resolvedContractVersion',
            lc.resolvedContractVersion, oc.resolvedContractVersion)
        }
      }
    }
    const lockedCapIds = new Set(locked.capabilities.map(c => c.capabilityId))
    for (const oc of observed.capabilities) {
      if (!lockedCapIds.has(oc.capabilityId)) {
        add('capability-binding-unexpected', 'capability', oc.capabilityId, 'capabilityId', undefined, oc.capabilityId)
      }
    }

    // ── Packages ─────────────────────────────────────────────────────────────
    const obsPkgs = new Map(observed.packages.map(p => [p.packageId, p]))
    for (const lp of locked.packages) {
      const op = obsPkgs.get(lp.packageId)
      if (!op) {
        add('package-missing', 'package', lp.packageId, 'packageId', lp.packageId, undefined)
      } else {
        if (op.version !== undefined && lp.version !== op.version) {
          add('package-version-drift', 'package', lp.packageId, 'version', lp.version, op.version)
        }
        if (op.integrity !== undefined && lp.integrity.value !== op.integrity.value) {
          add('package-integrity-drift', 'package', lp.packageId, 'integrity', lp.integrity.value, op.integrity.value)
        }
        if (op.source !== undefined) {
          const lockedSourceId = sourceIdentity(lp.source)
          const obsSourceId = sourceIdentity(op.source)
          if (lockedSourceId !== obsSourceId) {
            add('package-source-identity-drift', 'package', lp.packageId, 'source', lockedSourceId, obsSourceId)
          }
        }
      }
    }
    const lockedPkgIds = new Set(locked.packages.map(p => p.packageId))
    for (const op of observed.packages) {
      if (!lockedPkgIds.has(op.packageId)) {
        add('package-unexpected', 'package', op.packageId, 'packageId', undefined, op.packageId)
      }
    }

    // ── Dependencies (npm) ───────────────────────────────────────────────────
    const lockedNpm = locked.dependencies.npm
    const obsNpm = observed.dependencies.npm
    if (lockedNpm) {
      if (!obsNpm || !obsNpm.packages) {
        // All locked npm packages are missing
        for (const lp of lockedNpm.packages) {
          add('dependency-missing', 'dependency', lp.packagePath, 'packagePath', lp.packagePath, undefined)
        }
      } else {
        const obsNpmMap = new Map((obsNpm.packages ?? []).map(p => [p.packagePath, p]))
        for (const lp of lockedNpm.packages) {
          const op = obsNpmMap.get(lp.packagePath)
          if (!op) {
            add('dependency-missing', 'dependency', lp.packagePath, 'packagePath', lp.packagePath, undefined)
          } else {
            if (op.version !== undefined && lp.version !== op.version) {
              add('dependency-version-drift', 'dependency', lp.packagePath, 'version', lp.version, op.version)
            }
            if (op.integrity !== undefined && lp.integrity && lp.integrity.value !== op.integrity.value) {
              add('dependency-integrity-drift', 'dependency', lp.packagePath, 'integrity', lp.integrity.value, op.integrity.value)
            }
          }
        }
        const lockedNpmPaths = new Set(lockedNpm.packages.map(p => p.packagePath))
        for (const op of obsNpm.packages ?? []) {
          if (!lockedNpmPaths.has(op.packagePath)) {
            add('dependency-unexpected', 'dependency', op.packagePath, 'packagePath', undefined, op.packagePath)
          }
        }
        if (obsNpm.packageLockSemanticHash !== undefined &&
            lockedNpm.packageLockSemanticHash !== obsNpm.packageLockSemanticHash) {
          add('dependency-lockfile-drift', 'dependency', 'package-lock.json', 'packageLockSemanticHash',
            lockedNpm.packageLockSemanticHash, obsNpm.packageLockSemanticHash)
        }
      }
    } else if (obsNpm?.packages && obsNpm.packages.length > 0) {
      // No locked npm section but observed has packages → all unexpected
      for (const op of obsNpm.packages) {
        add('dependency-unexpected', 'dependency', op.packagePath, 'packagePath', undefined, op.packagePath)
      }
    }

    // ── Models ────────────────────────────────────────────────────────────────
    const obsModels = new Map(observed.models.map(m => [m.modelId, m]))
    for (const lm of locked.models) {
      const om = obsModels.get(lm.modelId)
      if (!om) {
        add('model-missing', 'model', lm.modelId, 'modelId', lm.modelId, undefined)
      } else {
        if (om.version !== undefined && lm.version !== om.version) {
          add('model-version-drift', 'model', lm.modelId, 'version', lm.version, om.version)
        }
        if (om.integrity !== undefined && lm.integrity.value !== om.integrity.value) {
          add('model-integrity-drift', 'model', lm.modelId, 'integrity', lm.integrity.value, om.integrity.value)
        }
      }
    }
    const lockedModelIds = new Set(locked.models.map(m => m.modelId))
    for (const om of observed.models) {
      if (!lockedModelIds.has(om.modelId)) {
        add('model-unexpected', 'model', om.modelId, 'modelId', undefined, om.modelId)
      }
    }

    // ── Providers ─────────────────────────────────────────────────────────────
    const obsProviders = new Map(observed.providers.map(p => [p.providerId, p]))
    for (const lp of locked.providers) {
      const op = obsProviders.get(lp.providerId)
      if (!op) {
        add('provider-missing', 'provider', lp.providerId, 'providerId', lp.providerId, undefined)
      } else {
        if (op.version !== undefined && lp.version !== op.version) {
          add('provider-version-drift', 'provider', lp.providerId, 'version', lp.version, op.version)
        }
        if (op.packageId !== undefined && lp.packageId !== op.packageId) {
          add('provider-package-drift', 'provider', lp.providerId, 'packageId', lp.packageId, op.packageId)
        }
        if (op.registryPointer !== undefined && lp.registryPointer !== op.registryPointer) {
          add('provider-registry-drift', 'provider', lp.providerId, 'registryPointer', lp.registryPointer, op.registryPointer)
        }
        if (op.state !== undefined && op.state !== 'ready') {
          add('provider-not-ready', 'provider', lp.providerId, 'state', 'ready', op.state)
        }
      }
    }
    const lockedProvIds = new Set(locked.providers.map(p => p.providerId))
    for (const op of observed.providers) {
      if (!lockedProvIds.has(op.providerId)) {
        add('provider-unexpected', 'provider', op.providerId, 'providerId', undefined, op.providerId)
      }
    }

    // ── Runtime ───────────────────────────────────────────────────────────────
    const lr = locked.runtime
    const or_ = observed.runtime
    if (or_.runtimeVersion !== undefined && lr.runtimeVersion !== or_.runtimeVersion) {
      add('runtime-version-drift', 'runtime', 'nodejs', 'runtimeVersion', lr.runtimeVersion, or_.runtimeVersion)
    }
    if (or_.runtimeAbi !== undefined && lr.runtimeAbi !== undefined && lr.runtimeAbi !== or_.runtimeAbi) {
      add('runtime-abi-drift', 'runtime', 'nodejs', 'runtimeAbi', lr.runtimeAbi, or_.runtimeAbi)
    }
    if (or_.packageManager !== undefined && lr.packageManager !== undefined &&
        lr.packageManager.version !== or_.packageManager.version) {
      add('package-manager-version-drift', 'runtime', 'npm', 'packageManager.version',
        lr.packageManager.version, or_.packageManager.version)
    }
    if (or_.os !== undefined && lr.os !== or_.os) {
      add('platform-os-drift', 'platform', 'os', 'os', lr.os, or_.os)
    }
    if (or_.architecture !== undefined && lr.architecture !== or_.architecture) {
      add('platform-architecture-drift', 'platform', 'architecture', 'architecture', lr.architecture, or_.architecture)
    }
    if (or_.libc !== undefined && lr.libc !== undefined && lr.libc !== or_.libc) {
      add('platform-libc-drift', 'platform', 'libc', 'libc', lr.libc, or_.libc)
    }

    // ── Infrastructure ────────────────────────────────────────────────────────
    const obsInfra = new Map(observed.infrastructure.map(i => [i.serviceId, i]))
    for (const li of locked.infrastructure) {
      const oi = obsInfra.get(li.serviceId)
      if (!oi) {
        add('infrastructure-missing', 'infrastructure', li.serviceId, 'serviceId', li.serviceId, undefined)
      } else {
        if (oi.strategy !== undefined && li.strategy !== oi.strategy) {
          add('infrastructure-strategy-drift', 'infrastructure', li.serviceId, 'strategy', li.strategy, oi.strategy)
        }
        if (oi.observedIdentity !== undefined && li.observedIdentity !== undefined &&
            li.observedIdentity !== oi.observedIdentity) {
          add('infrastructure-identity-drift', 'infrastructure', li.serviceId, 'observedIdentity',
            li.observedIdentity, oi.observedIdentity)
        }
        if (oi.configurationSemanticHash !== undefined && li.configurationSemanticHash !== undefined &&
            li.configurationSemanticHash !== oi.configurationSemanticHash) {
          add('infrastructure-configuration-drift', 'infrastructure', li.serviceId, 'configurationSemanticHash',
            li.configurationSemanticHash, oi.configurationSemanticHash)
        }
      }
    }
    const lockedInfraIds = new Set(locked.infrastructure.map(i => i.serviceId))
    for (const oi of observed.infrastructure) {
      if (!lockedInfraIds.has(oi.serviceId)) {
        add('infrastructure-unexpected', 'infrastructure', oi.serviceId, 'serviceId', undefined, oi.serviceId)
      }
    }

    // ── Configuration ─────────────────────────────────────────────────────────
    const obsConfig = new Map(observed.configuration.map(c => [`${c.configurationKey}:${c.destination ?? ''}`, c]))
    for (const lc of locked.configuration) {
      const key = `${lc.configurationKey}:${lc.destination}`
      const oc = obsConfig.get(key)
      if (!oc) {
        add('configuration-missing', 'configuration', lc.configurationKey, 'configurationKey', lc.configurationKey, undefined)
      } else {
        if (oc.contentSemanticHash !== undefined && lc.contentSemanticHash !== oc.contentSemanticHash) {
          add('configuration-content-drift', 'configuration', lc.configurationKey, 'contentSemanticHash',
            lc.contentSemanticHash, oc.contentSemanticHash)
        }
        if ((oc.writePolicy !== undefined && lc.writePolicy !== oc.writePolicy) ||
            (oc.templateId !== undefined && lc.templateId !== oc.templateId)) {
          add('configuration-provenance-drift', 'configuration', lc.configurationKey, 'writePolicy/templateId',
            `${lc.writePolicy}/${lc.templateId}`, `${oc.writePolicy ?? lc.writePolicy}/${oc.templateId ?? lc.templateId}`)
        }
      }
    }
    const lockedConfigKeys = new Set(locked.configuration.map(c => `${c.configurationKey}:${c.destination}`))
    for (const oc of observed.configuration) {
      const key = `${oc.configurationKey}:${oc.destination ?? ''}`
      if (!lockedConfigKeys.has(key)) {
        add('configuration-unexpected', 'configuration', oc.configurationKey, 'configurationKey', undefined, oc.configurationKey)
      }
    }

    // ── Policies ──────────────────────────────────────────────────────────────
    const lp = locked.policies
    const op = observed.policies
    if (op.trustPolicySemanticHash !== undefined && lp.trustPolicySemanticHash !== op.trustPolicySemanticHash) {
      add('trust-policy-drift', 'policy', 'trust', 'trustPolicySemanticHash',
        lp.trustPolicySemanticHash, op.trustPolicySemanticHash)
    }
    if (op.permissionPolicySemanticHash !== undefined && lp.permissionPolicySemanticHash !== op.permissionPolicySemanticHash) {
      add('permission-policy-drift', 'policy', 'permission', 'permissionPolicySemanticHash',
        lp.permissionPolicySemanticHash, op.permissionPolicySemanticHash)
    }
    if (op.authorizationPolicySemanticHash !== undefined && lp.authorizationPolicySemanticHash !== op.authorizationPolicySemanticHash) {
      add('authorization-policy-drift', 'policy', 'authorization', 'authorizationPolicySemanticHash',
        lp.authorizationPolicySemanticHash, op.authorizationPolicySemanticHash)
    }

    return {
      lockSemanticHash: locked.semanticHash,
      mode,
      status: reportStatus(entries),
      entries,
    }
  }
}

function sourceIdentity(src: { sourceKind: string; [k: string]: unknown }): string {
  switch (src.sourceKind) {
    case 'registry': return `registry:${src['registryId']}:${src['artifactLocator']}`
    case 'workspace-artifact': return `workspace:${src['workspaceArtifactId']}`
    case 'content-addressed': return `ca:${src['storeId']}`
    case 'authorized-uri': return `uri:${src['sourceIdentity']}`
    default: return JSON.stringify(src)
  }
}
