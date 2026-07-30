import { PACKAGE_MANIFEST_SCHEMA_VERSION } from '@rohinik-org/package-manifest-ir'
import type { ManifestValidationIssue, PackageManifestErrorCode } from '@rohinik-org/package-manifest-ir'

// ─── StructuredDoc: all fields type-checked but not semantically validated ────

export interface RawProvidedCapability {
  capability: string
  version: string
  description?: string
  deprecated?: boolean
}

export interface RawConsumedCapability {
  capability: string
  versionRange: string
  optional?: boolean
}

export interface RawNpmDep {
  name: string
  version: string
  optional?: boolean
}

export interface StructuredDoc {
  readonly schemaVersion: string
  readonly package: {
    id: string; name: string; version: string; type: string
    description?: string; license?: string; homepage?: string; repository?: string
  }
  readonly publisher?: { id: string; certification: string; url?: string }
  readonly runtime?: { language: string; languageVersion?: string; entrypoint?: string }
  readonly provides?: readonly RawProvidedCapability[]
  readonly consumes?: readonly RawConsumedCapability[]
  readonly dependencies?: {
    rohinik?: readonly string[]
    npm?: readonly RawNpmDep[]
  }
  readonly configuration?: {
    secrets?: readonly { name: string; required: boolean; description?: string }[]
    environment?: readonly { name: string; required: boolean; default?: string; description?: string }[]
  }
  readonly permissions?: Record<string, unknown>
  readonly health?: { startup?: string; readiness?: string; liveness?: string }
  readonly lifecycle?: { idempotentShutdown?: boolean; gracefulShutdownTimeoutMs?: number }
  readonly metadata?: Record<string, string>
}

export type StructuralResult =
  | { readonly valid: true; readonly doc: StructuredDoc }
  | { readonly valid: false; readonly issues: ManifestValidationIssue[] }

// ─── Allowed key sets ─────────────────────────────────────────────────────────

const ALLOWED_TOP_LEVEL = new Set([
  'schemaVersion', 'package', 'publisher', 'runtime', 'provides', 'consumes',
  'dependencies', 'configuration', 'permissions', 'health', 'lifecycle', 'metadata',
])
const ALLOWED_PACKAGE = new Set(['id', 'name', 'version', 'type', 'description', 'license', 'homepage', 'repository'])
const ALLOWED_PUBLISHER = new Set(['id', 'certification', 'url'])
const ALLOWED_RUNTIME = new Set(['language', 'languageVersion', 'entrypoint'])
const ALLOWED_PROVIDED_CAP = new Set(['capability', 'version', 'description', 'deprecated'])
const ALLOWED_CONSUMED_CAP = new Set(['capability', 'versionRange', 'optional'])
const ALLOWED_DEPENDENCIES = new Set(['rohinik', 'npm'])
const ALLOWED_NPM_DEP = new Set(['name', 'version', 'optional'])
const ALLOWED_CONFIGURATION = new Set(['secrets', 'environment'])
const ALLOWED_SECRET = new Set(['name', 'required', 'description'])
const ALLOWED_ENV_VAR = new Set(['name', 'required', 'default', 'description'])
const ALLOWED_HEALTH = new Set(['startup', 'readiness', 'liveness'])
const ALLOWED_LIFECYCLE = new Set(['idempotentShutdown', 'gracefulShutdownTimeoutMs'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function issue(
  issues: ManifestValidationIssue[],
  code: PackageManifestErrorCode,
  message: string,
  path?: string,
): void {
  issues.push({ severity: 'error', code, message, ...(path ? { path } : {}) })
}

function rejectUnknown(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  pathPrefix: string,
  issues: ManifestValidationIssue[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      issue(issues, 'validation-failed', `Unknown field '${key}' at ${pathPrefix}`, `${pathPrefix}.${key}`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function validateStructure(doc: Record<string, unknown>): StructuralResult {
  const issues: ManifestValidationIssue[] = []

  // schemaVersion
  if (!('schemaVersion' in doc)) {
    issue(issues, 'unsupported-schema', 'schemaVersion is required', 'schemaVersion')
  } else if (doc['schemaVersion'] !== PACKAGE_MANIFEST_SCHEMA_VERSION) {
    issue(issues, 'unsupported-schema', `Unsupported schemaVersion '${doc['schemaVersion']}'. Expected: ${PACKAGE_MANIFEST_SCHEMA_VERSION}`, 'schemaVersion')
  }

  // top-level unknown keys
  rejectUnknown(doc, ALLOWED_TOP_LEVEL, '<root>', issues)

  // package (required)
  const pkgRaw = asObj(doc['package'])
  if (!pkgRaw) {
    issue(issues, 'invalid-input', 'package section is required and must be a mapping', 'package')
  } else {
    rejectUnknown(pkgRaw, ALLOWED_PACKAGE, 'package', issues)
    for (const f of ['id', 'name', 'version', 'type'] as const) {
      if (!asStr(pkgRaw[f])) {
        issue(issues, 'invalid-input', `package.${f} is required and must be a string`, `package.${f}`)
      }
    }
    for (const f of ['description', 'license', 'homepage', 'repository'] as const) {
      if (pkgRaw[f] !== undefined && !asStr(pkgRaw[f])) {
        issue(issues, 'invalid-input', `package.${f} must be a string`, `package.${f}`)
      }
    }
  }

  // publisher (optional)
  if ('publisher' in doc) {
    const pubRaw = asObj(doc['publisher'])
    if (!pubRaw) {
      issue(issues, 'invalid-input', 'publisher must be a mapping', 'publisher')
    } else {
      rejectUnknown(pubRaw, ALLOWED_PUBLISHER, 'publisher', issues)
      if (!asStr(pubRaw['id'])) issue(issues, 'invalid-input', 'publisher.id is required and must be a string', 'publisher.id')
      if (!asStr(pubRaw['certification'])) issue(issues, 'invalid-input', 'publisher.certification is required and must be a string', 'publisher.certification')
      if (pubRaw['url'] !== undefined && !asStr(pubRaw['url'])) {
        issue(issues, 'invalid-input', 'publisher.url must be a string', 'publisher.url')
      }
    }
  }

  // runtime (optional)
  if ('runtime' in doc) {
    const rtRaw = asObj(doc['runtime'])
    if (!rtRaw) {
      issue(issues, 'invalid-input', 'runtime must be a mapping', 'runtime')
    } else {
      rejectUnknown(rtRaw, ALLOWED_RUNTIME, 'runtime', issues)
      if (!asStr(rtRaw['language'])) issue(issues, 'invalid-input', 'runtime.language is required and must be a string', 'runtime.language')
      for (const f of ['languageVersion', 'entrypoint'] as const) {
        if (rtRaw[f] !== undefined && !asStr(rtRaw[f])) {
          issue(issues, 'invalid-input', `runtime.${f} must be a string`, `runtime.${f}`)
        }
      }
    }
  }

  // provides (optional array)
  const rawProvides: RawProvidedCapability[] = []
  if ('provides' in doc) {
    if (!Array.isArray(doc['provides'])) {
      issue(issues, 'invalid-input', 'provides must be an array', 'provides')
    } else {
      for (let i = 0; i < doc['provides'].length; i++) {
        const item = asObj(doc['provides'][i])
        const path = `provides[${i}]`
        if (!item) { issue(issues, 'invalid-input', `${path} must be a mapping`, path); continue }
        rejectUnknown(item, ALLOWED_PROVIDED_CAP, path, issues)
        if (!asStr(item['capability'])) issue(issues, 'invalid-input', `${path}.capability is required and must be a string`, `${path}.capability`)
        if (!asStr(item['version'])) issue(issues, 'invalid-input', `${path}.version is required and must be a string`, `${path}.version`)
        if (item['deprecated'] !== undefined && asBool(item['deprecated']) === undefined) {
          issue(issues, 'invalid-input', `${path}.deprecated must be a boolean`, `${path}.deprecated`)
        }
        const cap: RawProvidedCapability = {
          capability: asStr(item['capability']) ?? '',
          version: asStr(item['version']) ?? '',
        }
        const desc = asStr(item['description'])
        if (desc !== undefined) cap.description = desc
        const dep = asBool(item['deprecated'])
        if (dep !== undefined) cap.deprecated = dep
        rawProvides.push(cap)
      }
    }
  }

  // consumes (optional array)
  const rawConsumes: RawConsumedCapability[] = []
  if ('consumes' in doc) {
    if (!Array.isArray(doc['consumes'])) {
      issue(issues, 'invalid-input', 'consumes must be an array', 'consumes')
    } else {
      for (let i = 0; i < doc['consumes'].length; i++) {
        const item = asObj(doc['consumes'][i])
        const path = `consumes[${i}]`
        if (!item) { issue(issues, 'invalid-input', `${path} must be a mapping`, path); continue }
        rejectUnknown(item, ALLOWED_CONSUMED_CAP, path, issues)
        if (!asStr(item['capability'])) issue(issues, 'invalid-input', `${path}.capability is required and must be a string`, `${path}.capability`)
        if (!asStr(item['versionRange'])) issue(issues, 'invalid-input', `${path}.versionRange is required and must be a string`, `${path}.versionRange`)
        const consumed: RawConsumedCapability = {
          capability: asStr(item['capability']) ?? '',
          versionRange: asStr(item['versionRange']) ?? '',
        }
        const opt = asBool(item['optional'])
        if (opt !== undefined) consumed.optional = opt
        rawConsumes.push(consumed)
      }
    }
  }

  // dependencies (optional)
  let rawDeps: StructuredDoc['dependencies'] | undefined
  if ('dependencies' in doc) {
    const depsRaw = asObj(doc['dependencies'])
    if (!depsRaw) {
      issue(issues, 'invalid-input', 'dependencies must be a mapping', 'dependencies')
    } else {
      rejectUnknown(depsRaw, ALLOWED_DEPENDENCIES, 'dependencies', issues)
      const rawNpm: RawNpmDep[] = []
      if (depsRaw['npm'] !== undefined) {
        if (!Array.isArray(depsRaw['npm'])) {
          issue(issues, 'invalid-input', 'dependencies.npm must be an array', 'dependencies.npm')
        } else {
          for (let i = 0; i < depsRaw['npm'].length; i++) {
            const item = asObj(depsRaw['npm'][i])
            const path = `dependencies.npm[${i}]`
            if (!item) { issue(issues, 'invalid-input', `${path} must be a mapping`, path); continue }
            rejectUnknown(item, ALLOWED_NPM_DEP, path, issues)
            if (!asStr(item['name'])) issue(issues, 'invalid-input', `${path}.name is required and must be a string`, `${path}.name`)
            if (!asStr(item['version'])) issue(issues, 'invalid-input', `${path}.version is required and must be a string`, `${path}.version`)
            const npmDep: RawNpmDep = { name: asStr(item['name']) ?? '', version: asStr(item['version']) ?? '' }
            const opt = asBool(item['optional'])
            if (opt !== undefined) npmDep.optional = opt
            rawNpm.push(npmDep)
          }
        }
      }
      const rawRohinik: readonly string[] | undefined = (() => {
        if (depsRaw['rohinik'] === undefined) return undefined
        if (!Array.isArray(depsRaw['rohinik'])) {
          issue(issues, 'invalid-input', 'dependencies.rohinik must be an array of strings', 'dependencies.rohinik')
          return undefined
        }
        return depsRaw['rohinik'] as string[]
      })()
      rawDeps = {}
      if (rawRohinik !== undefined) rawDeps = { ...rawDeps, rohinik: rawRohinik }
      if (depsRaw['npm'] !== undefined) rawDeps = { ...rawDeps, npm: rawNpm }
    }
  }

  // configuration (optional)
  let rawConfig: StructuredDoc['configuration'] | undefined
  if ('configuration' in doc) {
    const cfgRaw = asObj(doc['configuration'])
    if (!cfgRaw) {
      issue(issues, 'invalid-input', 'configuration must be a mapping', 'configuration')
    } else {
      rejectUnknown(cfgRaw, ALLOWED_CONFIGURATION, 'configuration', issues)
      rawConfig = {}
      if (cfgRaw['secrets'] !== undefined) {
        if (!Array.isArray(cfgRaw['secrets'])) {
          issue(issues, 'invalid-input', 'configuration.secrets must be an array', 'configuration.secrets')
        } else {
          rawConfig.secrets = (cfgRaw['secrets'] as unknown[]).map((s, i) => {
            const obj = asObj(s)
            const path = `configuration.secrets[${i}]`
            if (!obj) { issue(issues, 'invalid-input', `${path} must be a mapping`, path); return { name: '', required: false } }
            rejectUnknown(obj, ALLOWED_SECRET, path, issues)
            const sec: { name: string; required: boolean; description?: string } = {
              name: asStr(obj['name']) ?? '',
              required: asBool(obj['required']) ?? false,
            }
            const d = asStr(obj['description'])
            if (d !== undefined) sec.description = d
            return sec
          })
        }
      }
      if (cfgRaw['environment'] !== undefined) {
        if (!Array.isArray(cfgRaw['environment'])) {
          issue(issues, 'invalid-input', 'configuration.environment must be an array', 'configuration.environment')
        } else {
          rawConfig.environment = (cfgRaw['environment'] as unknown[]).map((e, i) => {
            const obj = asObj(e)
            const path = `configuration.environment[${i}]`
            if (!obj) { issue(issues, 'invalid-input', `${path} must be a mapping`, path); return { name: '', required: false } }
            rejectUnknown(obj, ALLOWED_ENV_VAR, path, issues)
            const env: { name: string; required: boolean; default?: string; description?: string } = {
              name: asStr(obj['name']) ?? '',
              required: asBool(obj['required']) ?? false,
            }
            const def = asStr(obj['default'])
            if (def !== undefined) env.default = def
            const desc = asStr(obj['description'])
            if (desc !== undefined) env.description = desc
            return env
          })
        }
      }
    }
  }

  // permissions (optional — treated as opaque object)
  let rawPerms: Record<string, unknown> | undefined
  if ('permissions' in doc) {
    const permsRaw = asObj(doc['permissions'])
    if (!permsRaw) {
      issue(issues, 'invalid-input', 'permissions must be a mapping', 'permissions')
    } else {
      rawPerms = permsRaw
    }
  }

  // health (optional)
  let rawHealth: StructuredDoc['health'] | undefined
  if ('health' in doc) {
    const hlRaw = asObj(doc['health'])
    if (!hlRaw) {
      issue(issues, 'invalid-input', 'health must be a mapping', 'health')
    } else {
      rejectUnknown(hlRaw, ALLOWED_HEALTH, 'health', issues)
      rawHealth = {}
      const startup = asStr(hlRaw['startup'])
      if (startup !== undefined) rawHealth.startup = startup
      const readiness = asStr(hlRaw['readiness'])
      if (readiness !== undefined) rawHealth.readiness = readiness
      const liveness = asStr(hlRaw['liveness'])
      if (liveness !== undefined) rawHealth.liveness = liveness
    }
  }

  // lifecycle (optional)
  let rawLifecycle: StructuredDoc['lifecycle'] | undefined
  if ('lifecycle' in doc) {
    const lcRaw = asObj(doc['lifecycle'])
    if (!lcRaw) {
      issue(issues, 'invalid-input', 'lifecycle must be a mapping', 'lifecycle')
    } else {
      rejectUnknown(lcRaw, ALLOWED_LIFECYCLE, 'lifecycle', issues)
      rawLifecycle = {}
      const is = asBool(lcRaw['idempotentShutdown'])
      if (is !== undefined) rawLifecycle.idempotentShutdown = is
      const gs = typeof lcRaw['gracefulShutdownTimeoutMs'] === 'number' ? lcRaw['gracefulShutdownTimeoutMs'] : undefined
      if (gs !== undefined) rawLifecycle.gracefulShutdownTimeoutMs = gs
    }
  }

  // metadata (optional)
  let rawMetadata: Record<string, string> | undefined
  if ('metadata' in doc) {
    const metaRaw = asObj(doc['metadata'])
    if (!metaRaw) {
      issue(issues, 'invalid-input', 'metadata must be a mapping', 'metadata')
    } else {
      rawMetadata = metaRaw as Record<string, string>
    }
  }

  if (issues.some(i => i.severity === 'error')) {
    return { valid: false, issues }
  }

  // Build StructuredDoc — use explicit conditional assignments to satisfy exactOptionalPropertyTypes
  const pkgDoc: StructuredDoc['package'] = {
    id: asStr(pkgRaw!['id'])!,
    name: asStr(pkgRaw!['name'])!,
    version: asStr(pkgRaw!['version'])!,
    type: asStr(pkgRaw!['type'])!,
  }
  const pkgDesc = asStr(pkgRaw!['description'])
  if (pkgDesc !== undefined) pkgDoc.description = pkgDesc
  const pkgLic = asStr(pkgRaw!['license'])
  if (pkgLic !== undefined) pkgDoc.license = pkgLic
  const pkgHome = asStr(pkgRaw!['homepage'])
  if (pkgHome !== undefined) pkgDoc.homepage = pkgHome
  const pkgRepo = asStr(pkgRaw!['repository'])
  if (pkgRepo !== undefined) pkgDoc.repository = pkgRepo

  let structuredPublisher: StructuredDoc['publisher'] | undefined
  if (doc['publisher'] !== undefined) {
    const pubRaw = asObj(doc['publisher'])!
    const pub: NonNullable<StructuredDoc['publisher']> = {
      id: asStr(pubRaw['id'])!,
      certification: asStr(pubRaw['certification'])!,
    }
    const url = asStr(pubRaw['url'])
    if (url !== undefined) pub.url = url
    structuredPublisher = pub
  }

  let structuredRuntime: StructuredDoc['runtime'] | undefined
  if (doc['runtime'] !== undefined) {
    const rtRaw = asObj(doc['runtime'])!
    const rt: NonNullable<StructuredDoc['runtime']> = { language: asStr(rtRaw['language'])! }
    const lv = asStr(rtRaw['languageVersion'])
    if (lv !== undefined) rt.languageVersion = lv
    const ep = asStr(rtRaw['entrypoint'])
    if (ep !== undefined) rt.entrypoint = ep
    structuredRuntime = rt
  }

  const result: StructuredDoc = { schemaVersion: doc['schemaVersion'] as string, package: pkgDoc }
  if (structuredPublisher !== undefined) (result as { publisher?: StructuredDoc['publisher'] }).publisher = structuredPublisher
  if (structuredRuntime !== undefined) (result as { runtime?: StructuredDoc['runtime'] }).runtime = structuredRuntime
  if ('provides' in doc) (result as { provides?: readonly RawProvidedCapability[] }).provides = rawProvides
  if ('consumes' in doc) (result as { consumes?: readonly RawConsumedCapability[] }).consumes = rawConsumes
  if (rawDeps !== undefined) (result as { dependencies?: StructuredDoc['dependencies'] }).dependencies = rawDeps
  if (rawConfig !== undefined) (result as { configuration?: StructuredDoc['configuration'] }).configuration = rawConfig
  if (rawPerms !== undefined) (result as { permissions?: Record<string, unknown> }).permissions = rawPerms
  if (rawHealth !== undefined) (result as { health?: StructuredDoc['health'] }).health = rawHealth
  if (rawLifecycle !== undefined) (result as { lifecycle?: StructuredDoc['lifecycle'] }).lifecycle = rawLifecycle
  if (rawMetadata !== undefined) (result as { metadata?: Record<string, string> }).metadata = rawMetadata

  return { valid: true, doc: result }
}
