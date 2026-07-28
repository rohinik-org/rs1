import type {
  LockfileGenerator,
  DeliveredEnvironmentSnapshot,
  LockfileAuditInput,
  RohinikLockfileV1,
} from '@rohinik-org/lockfile-ir'
import { SnapshotAdmissionError } from '@rohinik-org/lockfile-ir'
import { buildSemanticProjection } from './semantic-projection.js'
import { semanticHash, auditHash } from './hasher.js'
import { LockfileValidatorImpl } from './parser.js'
import { cmp } from './canonicalizer.js'

const validator = new LockfileValidatorImpl()

export class LockfileGeneratorImpl implements LockfileGenerator {
  generate(snapshot: DeliveredEnvironmentSnapshot, audit: LockfileAuditInput): RohinikLockfileV1 {
    // 1. Validate snapshot schema
    if (snapshot.kind !== 'delivered-environment-snapshot') {
      throw new SnapshotAdmissionError(`Expected kind 'delivered-environment-snapshot', got '${snapshot.kind}'`)
    }
    if (snapshot.snapshotVersion !== 1) {
      throw new SnapshotAdmissionError(`Unsupported snapshotVersion: ${snapshot.snapshotVersion}`)
    }

    // 2. Validate snapshot admission
    if (snapshot.provisioningEvidence.status !== 'success') {
      throw new SnapshotAdmissionError(`Snapshot provisioningEvidence.status must be 'success'`)
    }
    if (!snapshot.provisioningEvidence.semanticJournalHash) {
      throw new SnapshotAdmissionError('Snapshot is missing semanticJournalHash')
    }

    // 3. Sort all collections deterministically
    const capabilities = [...snapshot.capabilities].sort((a, b) => cmp(a.capabilityId, b.capabilityId))
    const packages = [...snapshot.packages].sort((a, b) => {
      const c = cmp(a.packageId, b.packageId)
      return c !== 0 ? c : cmp(a.version, b.version)
    })
    const models = [...snapshot.models].sort((a, b) => {
      const c = cmp(a.modelId, b.modelId)
      return c !== 0 ? c : cmp(a.version, b.version)
    })
    const infrastructure = [...snapshot.infrastructure].sort((a, b) => cmp(a.serviceId, b.serviceId))
    const providers = [...snapshot.providers]
      .map(p => ({ ...p, capabilityIds: [...p.capabilityIds].sort(cmp) }))
      .sort((a, b) => cmp(a.providerId, b.providerId))
    const configuration = [...snapshot.configuration]
      .map(c => ({ ...c, requiredSecretNames: [...c.requiredSecretNames].sort(cmp) }))
      .sort((a, b) => {
        const c = cmp(a.configurationKey, b.configurationKey)
        return c !== 0 ? c : cmp(a.destination, b.destination)
      })

    const catalogSnapshots = [...snapshot.resolution.catalogSnapshots].sort((a, b) =>
      cmp(a.catalogId, b.catalogId)
    )

    const npmPackages = snapshot.dependencies.npm
      ? [...snapshot.dependencies.npm.packages].sort((a, b) => {
          const c = cmp(a.packagePath, b.packagePath)
          return c !== 0 ? c : cmp(a.name, b.name)
        })
      : undefined

    const sortedModels = models.map(m => {
      const base = { ...m }
      if (m.files) {
        return { ...base, files: [...m.files].sort((a, b) => cmp(a.relativePath, b.relativePath)) }
      }
      return base
    })

    // 4. Build semantic projection input (without audit / hashes)
    const projectionInput: Omit<RohinikLockfileV1, 'semanticHash' | 'audit' | 'auditHash'> = {
      kind: 'rohinik-lockfile',
      lockVersion: 1,
      application: snapshot.application,
      runtime: snapshot.runtime,
      resolution: { ...snapshot.resolution, catalogSnapshots },
      capabilities,
      packages,
      dependencies: npmPackages !== undefined
        ? { npm: { ...snapshot.dependencies.npm!, packages: npmPackages } }
        : snapshot.dependencies,
      models: sortedModels,
      infrastructure,
      providers,
      configuration,
      policies: snapshot.policies,
    }

    // 5. Compute semantic hash
    const projection = buildSemanticProjection(projectionInput)
    const sHash = semanticHash(projection)

    // 6. Build full lockfile with audit
    const lockfileWithoutAuditHash = {
      ...projectionInput,
      semanticHash: sHash,
      audit,
    }

    // 7. Compute audit hash (over full lockfile including semanticHash + audit)
    const aHash = auditHash(lockfileWithoutAuditHash)

    const lockfile: RohinikLockfileV1 = {
      ...lockfileWithoutAuditHash,
      auditHash: aHash,
    }

    // 8. Validate the generated lockfile
    const result = validator.validate(lockfile)
    if (!result.valid) {
      throw new SnapshotAdmissionError(`Generated lockfile failed validation: ${result.diagnostics.map(d => d.message).join('; ')}`)
    }

    return lockfile
  }
}
