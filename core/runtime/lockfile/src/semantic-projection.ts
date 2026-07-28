import type { RohinikLockfileV1 } from '@rohinik-org/lockfile-ir'
import { cmp } from './canonicalizer.js'

type SemanticProjection = Omit<RohinikLockfileV1, 'semanticHash' | 'audit' | 'auditHash'>

// Sort helpers — UTF-16 ordinal (JS <) — see canonicalizer.ts

export function buildSemanticProjection(lockfile: SemanticProjection): unknown {
  const capabilities = [...lockfile.capabilities].sort((a, b) => cmp(a.capabilityId, b.capabilityId))

  const packages = [...lockfile.packages].sort((a, b) => {
    const c = cmp(a.packageId, b.packageId)
    return c !== 0 ? c : cmp(a.version, b.version)
  })

  const npmPackages = lockfile.dependencies.npm
    ? [...lockfile.dependencies.npm.packages].sort((a, b) => {
        const c = cmp(a.packagePath, b.packagePath)
        return c !== 0 ? c : cmp(a.name, b.name)
      })
    : undefined

  const models = [...lockfile.models].sort((a, b) => {
    const c = cmp(a.modelId, b.modelId)
    return c !== 0 ? c : cmp(a.version, b.version)
  })

  const infrastructure = [...lockfile.infrastructure].sort((a, b) => cmp(a.serviceId, b.serviceId))

  const providers = [...lockfile.providers].map(p => ({
    ...p,
    capabilityIds: [...p.capabilityIds].sort(cmp),
  })).sort((a, b) => cmp(a.providerId, b.providerId))

  const configuration = [...lockfile.configuration].sort((a, b) => {
    const c = cmp(a.configurationKey, b.configurationKey)
    return c !== 0 ? c : cmp(a.destination, b.destination)
  })

  const catalogSnapshots = [...lockfile.resolution.catalogSnapshots].sort((a, b) =>
    cmp(a.catalogId, b.catalogId)
  )

  const result: Record<string, unknown> = {
    kind: lockfile.kind,
    lockVersion: lockfile.lockVersion,
    application: lockfile.application,
    runtime: lockfile.runtime,
    resolution: { ...lockfile.resolution, catalogSnapshots },
    capabilities,
    packages,
    dependencies: npmPackages !== undefined
      ? { npm: { ...lockfile.dependencies.npm!, packages: npmPackages } }
      : lockfile.dependencies,
    models: models.map(m => ({
      ...m,
      files: m.files ? [...m.files].sort((a, b) => cmp(a.relativePath, b.relativePath)) : undefined,
    })),
    infrastructure,
    providers,
    configuration: configuration.map(c => ({
      ...c,
      requiredSecretNames: [...c.requiredSecretNames].sort(cmp),
    })),
    policies: lockfile.policies,
  }

  if (lockfile.extensions !== undefined) {
    result['extensions'] = lockfile.extensions
  }

  return result
}
