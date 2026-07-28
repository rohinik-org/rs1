import { load as yamlLoad, JSON_SCHEMA } from 'js-yaml'
import type { RohinikLockfileV1, LockfileValidator, LockfileValidationResult, LockfileDiagnostic } from '@rohinik-org/lockfile-ir'
import { LockfileParseError, LockfileValidationError } from '@rohinik-org/lockfile-ir'
import { buildSemanticProjection } from './semantic-projection.js'
import { semanticHash, auditHash } from './hasher.js'

export function parseLockfileYaml(yaml: string): unknown {
  let raw: unknown
  try {
    // JSON_SCHEMA: disables YAML custom tags, dates, etc. (JSON scalars only)
    raw = yamlLoad(yaml, { schema: JSON_SCHEMA })
  } catch (e) {
    throw new LockfileParseError(`YAML parse error: ${String(e)}`)
  }
  if (raw === null || raw === undefined) throw new LockfileParseError('Lockfile is empty')
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new LockfileParseError('Lockfile root must be a YAML mapping')
  }
  return raw
}

export class LockfileValidatorImpl implements LockfileValidator {
  parse(input: unknown): RohinikLockfileV1 {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new LockfileValidationError('Lockfile input must be a plain object')
    }
    const raw = input as Record<string, unknown>

    if (raw['kind'] !== 'rohinik-lockfile') {
      throw new LockfileValidationError(`Expected kind 'rohinik-lockfile', got '${raw['kind']}'`)
    }
    if (raw['lockVersion'] !== 1) {
      throw new LockfileValidationError(`Unsupported lockVersion: ${raw['lockVersion']}`)
    }

    const lockfile = raw as unknown as RohinikLockfileV1
    const result = this.validate(lockfile)
    if (!result.valid) {
      throw new LockfileValidationError(result.diagnostics.map(d => d.message).join('; '))
    }
    return lockfile
  }

  validate(lockfile: RohinikLockfileV1): LockfileValidationResult {
    const diagnostics: LockfileDiagnostic[] = []
    const add = (code: string, message: string, field?: string) => {
      const d: LockfileDiagnostic = field !== undefined ? { code, message, field } : { code, message }
      diagnostics.push(d)
    }

    // Required fields
    if (!lockfile.application) add('MISSING_FIELD', 'Missing required field: application', 'application')
    if (!lockfile.runtime) add('MISSING_FIELD', 'Missing required field: runtime', 'runtime')
    if (!lockfile.resolution) add('MISSING_FIELD', 'Missing required field: resolution', 'resolution')
    if (!lockfile.policies) add('MISSING_FIELD', 'Missing required field: policies', 'policies')

    const capabilities = lockfile.capabilities ?? []
    const packages = lockfile.packages ?? []
    const providers = lockfile.providers ?? []

    // No duplicate capabilityIds
    const capIds = capabilities.map(c => c.capabilityId)
    const dupCap = findDuplicates(capIds)
    for (const d of dupCap) add('DUPLICATE_CAPABILITY_ID', `Duplicate capabilityId: ${d}`, 'capabilities')

    // No duplicate packageIds
    const pkgIds = packages.map(p => p.packageId)
    const dupPkg = findDuplicates(pkgIds)
    for (const d of dupPkg) add('DUPLICATE_PACKAGE_ID', `Duplicate packageId: ${d}`, 'packages')

    // No duplicate providerIds
    const provIds = providers.map(p => p.providerId)
    const dupProv = findDuplicates(provIds)
    for (const d of dupProv) add('DUPLICATE_PROVIDER_ID', `Duplicate providerId: ${d}`, 'providers')

    // Every capability.providerId references an existing provider
    const providerIdSet = new Set(provIds)
    for (const cap of capabilities) {
      if (cap.providerId && !providerIdSet.has(cap.providerId)) {
        add('UNKNOWN_PROVIDER_REF', `Capability '${cap.capabilityId}' references unknown providerId '${cap.providerId}'`, 'capabilities')
      }
    }

    // Every provider.packageId references an existing package
    const packageIdSet = new Set(pkgIds)
    for (const prov of providers) {
      if (prov.packageId && !packageIdSet.has(prov.packageId)) {
        add('UNKNOWN_PACKAGE_REF', `Provider '${prov.providerId}' references unknown packageId '${prov.packageId}'`, 'providers')
      }
    }

    // No secret values (field named 'secretValue' anywhere)
    checkNoSecretValues(lockfile as unknown as Record<string, unknown>, '', diagnostics)

    // Bail early on structural issues before hash checks
    if (diagnostics.length > 0) return { valid: false, diagnostics }

    // Semantic hash check
    const projection = buildSemanticProjection({
      kind: lockfile.kind,
      lockVersion: lockfile.lockVersion,
      application: lockfile.application,
      runtime: lockfile.runtime,
      resolution: lockfile.resolution,
      capabilities: lockfile.capabilities,
      packages: lockfile.packages,
      dependencies: lockfile.dependencies,
      models: lockfile.models,
      infrastructure: lockfile.infrastructure,
      providers: lockfile.providers,
      configuration: lockfile.configuration,
      policies: lockfile.policies,
      ...(lockfile.extensions ? { extensions: lockfile.extensions } : {}),
    })
    const expectedSemHash = semanticHash(projection)
    if (lockfile.semanticHash !== expectedSemHash) {
      add('SEMANTIC_HASH_MISMATCH', `semanticHash mismatch: expected ${expectedSemHash}, got ${lockfile.semanticHash}`, 'semanticHash')
    }

    // Audit hash check (covers full lockfile including semanticHash + audit)
    const auditInput = {
      kind: lockfile.kind,
      lockVersion: lockfile.lockVersion,
      application: lockfile.application,
      runtime: lockfile.runtime,
      resolution: lockfile.resolution,
      capabilities: lockfile.capabilities,
      packages: lockfile.packages,
      dependencies: lockfile.dependencies,
      models: lockfile.models,
      infrastructure: lockfile.infrastructure,
      providers: lockfile.providers,
      configuration: lockfile.configuration,
      policies: lockfile.policies,
      semanticHash: lockfile.semanticHash,
      audit: lockfile.audit,
      ...(lockfile.extensions ? { extensions: lockfile.extensions } : {}),
    }
    const expectedAuditHash = auditHash(auditInput)
    if (lockfile.auditHash !== expectedAuditHash) {
      add('AUDIT_HASH_MISMATCH', `auditHash mismatch: expected ${expectedAuditHash}, got ${lockfile.auditHash}`, 'auditHash')
    }

    return { valid: diagnostics.length === 0, diagnostics }
  }
}

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const dups = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) dups.add(id)
    else seen.add(id)
  }
  return [...dups]
}

// Traverse the object graph looking for any key named 'secretValue'
function checkNoSecretValues(
  obj: Record<string, unknown> | unknown[],
  path: string,
  diagnostics: LockfileDiagnostic[],
): void {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const v = obj[i]
      if (v !== null && typeof v === 'object') {
        checkNoSecretValues(v as Record<string, unknown>, `${path}[${i}]`, diagnostics)
      }
    }
    return
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'secretValue' || k === 'secret_value') {
      diagnostics.push({ code: 'SECRET_VALUE_PRESENT', message: `Secret value found at field '${path}.${k}'`, field: `${path}.${k}` })
    }
    if (v !== null && typeof v === 'object') {
      checkNoSecretValues(v as Record<string, unknown>, `${path}.${k}`, diagnostics)
    }
  }
}
