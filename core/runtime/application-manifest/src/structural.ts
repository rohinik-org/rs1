import type { ApplicationManifestDiagnostic, ManifestDiagnosticCode } from '@rohinik-org/application-manifest-ir'
import { MANIFEST_SCHEMA_VERSION } from '@rohinik-org/application-manifest-ir'

// SourceDoc: all values still raw — semantic checks happen in semantic.ts
export interface RawCapabilityDecl {
  id: string
  version: string
  multiplicity?: string
  constraints?: Record<string, unknown>
}

export interface SourceDoc {
  readonly schemaVersion: string
  readonly application: { id: string; name: string; version: string }
  readonly runtime: { language: string; languageVersion?: string; entrypoint?: string }
  readonly capabilitiesRequired: readonly RawCapabilityDecl[]
  readonly capabilitiesOptional: readonly RawCapabilityDecl[]
  readonly dependencyManagementMode: string
  readonly resolution: { allowMarketplace: boolean; allowExternalRegistries: boolean; allowLocalPackages: boolean }
  readonly degradation: { allowOptionalCapabilityFailure: boolean }
}

export type StructuralResult =
  | { readonly status: 'ok'; readonly doc: SourceDoc }
  | { readonly status: 'error'; readonly diagnostics: readonly ApplicationManifestDiagnostic[] }

const ALLOWED_TOP_LEVEL = new Set([
  'schemaVersion', 'application', 'runtime', 'capabilities',
  'dependencyManagement', 'resolution', 'degradation',
])
const ALLOWED_APPLICATION = new Set(['id', 'name', 'version'])
const ALLOWED_RUNTIME = new Set(['language', 'languageVersion', 'entrypoint'])
const ALLOWED_CAPABILITY = new Set(['id', 'version', 'multiplicity', 'constraints'])
const ALLOWED_DEPENDENCY_MANAGEMENT = new Set(['mode'])
const ALLOWED_RESOLUTION = new Set(['allowMarketplace', 'allowExternalRegistries', 'allowLocalPackages'])
const ALLOWED_DEGRADATION = new Set(['allowOptionalCapabilityFailure'])

function err(
  diag: ApplicationManifestDiagnostic[],
  code: ManifestDiagnosticCode,
  message: string,
  path?: string,
): void {
  diag.push({ code, severity: 'error', message, ...(path ? { path } : {}) })
}

function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  code: ManifestDiagnosticCode,
  pathPrefix: string,
  diag: ApplicationManifestDiagnostic[],
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      err(diag, code, `Unknown field '${key}' at ${pathPrefix}`, `${pathPrefix}.${key}`)
    }
  }
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

export function validateStructure(doc: Record<string, unknown>): StructuralResult {
  const diag: ApplicationManifestDiagnostic[] = []

  rejectUnknownKeys(doc, ALLOWED_TOP_LEVEL, 'UNKNOWN_TOP_LEVEL_KEY', '<root>', diag)

  if (!('schemaVersion' in doc)) {
    err(diag, 'MISSING_SCHEMA_VERSION', 'schemaVersion is required', 'schemaVersion')
  } else if (doc['schemaVersion'] !== MANIFEST_SCHEMA_VERSION) {
    err(diag, 'UNSUPPORTED_SCHEMA_VERSION', `Unsupported schemaVersion '${doc['schemaVersion']}'. Expected: ${MANIFEST_SCHEMA_VERSION}`, 'schemaVersion')
  }

  const appRaw = asObj(doc['application'])
  if (!appRaw) {
    err(diag, 'MISSING_APPLICATION', 'application block is required', 'application')
  } else {
    rejectUnknownKeys(appRaw, ALLOWED_APPLICATION, 'UNKNOWN_APPLICATION_KEY', 'application', diag)
    if (!asStr(appRaw['id'])) err(diag, 'MISSING_APPLICATION_ID', 'application.id is required', 'application.id')
    if (!asStr(appRaw['name'])) err(diag, 'MISSING_APPLICATION_NAME', 'application.name is required', 'application.name')
    if (!asStr(appRaw['version'])) err(diag, 'MISSING_APPLICATION_VERSION', 'application.version is required', 'application.version')
  }

  const rtRaw = asObj(doc['runtime'])
  if (!rtRaw) {
    err(diag, 'MISSING_RUNTIME', 'runtime block is required', 'runtime')
  } else {
    rejectUnknownKeys(rtRaw, ALLOWED_RUNTIME, 'UNKNOWN_RUNTIME_KEY', 'runtime', diag)
    if (!asStr(rtRaw['language'])) err(diag, 'MISSING_RUNTIME_LANGUAGE', 'runtime.language is required', 'runtime.language')
  }

  const ALLOWED_CAPABILITIES = new Set(['required', 'optional'])
  const capsRaw = asObj(doc['capabilities'])
  const rawRequired: RawCapabilityDecl[] = []
  const rawOptional: RawCapabilityDecl[] = []
  if (!capsRaw) {
    err(diag, 'MISSING_CAPABILITIES', 'capabilities block is required', 'capabilities')
  } else {
    rejectUnknownKeys(capsRaw, ALLOWED_CAPABILITIES, 'UNKNOWN_CAPABILITIES_KEY', 'capabilities', diag)
    const reqList = capsRaw['required']
    const optList = capsRaw['optional']
    if (!Array.isArray(reqList)) {
      err(diag, 'CAPABILITIES_REQUIRED_NOT_ARRAY', 'capabilities.required must be an array', 'capabilities.required')
    } else {
      for (let i = 0; i < reqList.length; i++) {
        const item = asObj(reqList[i])
        if (!item) { err(diag, 'CAPABILITY_NOT_OBJECT', `capabilities.required[${i}] must be a mapping`, `capabilities.required[${i}]`); continue }
        rejectUnknownKeys(item, ALLOWED_CAPABILITY, 'UNKNOWN_CAPABILITY_KEY', `capabilities.required[${i}]`, diag)
        const rawId = item['id']
        const rawVersion = item['version']
        if (rawId === undefined || rawId === null) {
          err(diag, 'MISSING_CAPABILITY_ID', `capabilities.required[${i}].id is required`, `capabilities.required[${i}].id`)
          continue
        }
        if (rawVersion === undefined || rawVersion === null) {
          err(diag, 'MISSING_CAPABILITY_VERSION', `capabilities.required[${i}].version is required`, `capabilities.required[${i}].version`)
          continue
        }
        const id = asStr(rawId) ?? ''
        const version = asStr(rawVersion) ?? ''
        const multiplicity = item['multiplicity'] !== undefined ? asStr(item['multiplicity']) : undefined
        if (item['multiplicity'] !== undefined && multiplicity === undefined) {
          err(diag, 'INVALID_MULTIPLICITY', `capabilities.required[${i}].multiplicity must be a string`, `capabilities.required[${i}].multiplicity`)
          continue
        }
        const constraints = item['constraints'] !== undefined ? asObj(item['constraints']) : undefined
        if (item['constraints'] !== undefined && !constraints) {
          err(diag, 'CONSTRAINTS_NOT_OBJECT', `capabilities.required[${i}].constraints must be a mapping`, `capabilities.required[${i}].constraints`)
          continue
        }
        rawRequired.push({ id, version, ...(multiplicity !== undefined ? { multiplicity } : {}), ...(constraints ? { constraints } : {}) })
      }
    }
    if (!Array.isArray(optList)) {
      err(diag, 'CAPABILITIES_OPTIONAL_NOT_ARRAY', 'capabilities.optional must be an array', 'capabilities.optional')
    } else {
      for (let i = 0; i < optList.length; i++) {
        const item = asObj(optList[i])
        if (!item) { err(diag, 'CAPABILITY_NOT_OBJECT', `capabilities.optional[${i}] must be a mapping`, `capabilities.optional[${i}]`); continue }
        rejectUnknownKeys(item, ALLOWED_CAPABILITY, 'UNKNOWN_CAPABILITY_KEY', `capabilities.optional[${i}]`, diag)
        const optId = item['id']
        const optVersion = item['version']
        if (optId === undefined || optId === null) {
          err(diag, 'MISSING_CAPABILITY_ID', `capabilities.optional[${i}].id is required`, `capabilities.optional[${i}].id`)
          continue
        }
        if (optVersion === undefined || optVersion === null) {
          err(diag, 'MISSING_CAPABILITY_VERSION', `capabilities.optional[${i}].version is required`, `capabilities.optional[${i}].version`)
          continue
        }
        const id = asStr(optId) ?? ''
        const version = asStr(optVersion) ?? ''
        const optMultiplicity = item['multiplicity'] !== undefined ? asStr(item['multiplicity']) : undefined
        if (item['multiplicity'] !== undefined && optMultiplicity === undefined) {
          err(diag, 'INVALID_MULTIPLICITY', `capabilities.optional[${i}].multiplicity must be a string`, `capabilities.optional[${i}].multiplicity`)
        }
        const optConstraints = item['constraints'] !== undefined ? asObj(item['constraints']) : undefined
        if (item['constraints'] !== undefined && !optConstraints) {
          err(diag, 'CONSTRAINTS_NOT_OBJECT', `capabilities.optional[${i}].constraints must be a mapping`, `capabilities.optional[${i}].constraints`)
        }
        rawOptional.push({ id, version, ...(optMultiplicity !== undefined ? { multiplicity: optMultiplicity } : {}), ...(optConstraints ? { constraints: optConstraints } : {}) })
      }
    }
  }

  const depMgmtRaw = asObj(doc['dependencyManagement'])
  if (!depMgmtRaw) {
    err(diag, 'MISSING_DEPENDENCY_MANAGEMENT', 'dependencyManagement block is required', 'dependencyManagement')
  } else {
    rejectUnknownKeys(depMgmtRaw, ALLOWED_DEPENDENCY_MANAGEMENT, 'UNKNOWN_DEPENDENCY_MANAGEMENT_KEY', 'dependencyManagement', diag)
    const mode = asStr(depMgmtRaw['mode'])
    if (!mode || !['managed', 'observed', 'immutable'].includes(mode)) {
      err(diag, 'INVALID_DEPENDENCY_MANAGEMENT_MODE', `dependencyManagement.mode must be managed|observed|immutable, got: ${depMgmtRaw['mode']}`, 'dependencyManagement.mode')
    }
  }

  const resRaw = asObj(doc['resolution'])
  if (!resRaw) {
    err(diag, 'MISSING_RESOLUTION', 'resolution block is required', 'resolution')
  } else {
    rejectUnknownKeys(resRaw, ALLOWED_RESOLUTION, 'UNKNOWN_RESOLUTION_KEY', 'resolution', diag)
    for (const field of ['allowMarketplace', 'allowExternalRegistries', 'allowLocalPackages'] as const) {
      if (asBool(resRaw[field]) === undefined) {
        err(diag, 'INVALID_RESOLUTION_FIELD', `resolution.${field} must be a boolean, got: ${resRaw[field]}`, `resolution.${field}`)
      }
    }
  }

  const degRaw = asObj(doc['degradation'])
  if (!degRaw) {
    err(diag, 'MISSING_DEGRADATION', 'degradation block is required', 'degradation')
  } else {
    rejectUnknownKeys(degRaw, ALLOWED_DEGRADATION, 'UNKNOWN_DEGRADATION_KEY', 'degradation', diag)
    if (asBool(degRaw['allowOptionalCapabilityFailure']) === undefined) {
      err(diag, 'INVALID_DEGRADATION_FIELD', `degradation.allowOptionalCapabilityFailure must be a boolean, got: ${degRaw['allowOptionalCapabilityFailure']}`, 'degradation.allowOptionalCapabilityFailure')
    }
  }

  if (diag.some(d => d.severity === 'error')) {
    return { status: 'error', diagnostics: diag }
  }

  return {
    status: 'ok',
    doc: {
      schemaVersion: doc['schemaVersion'] as string,
      application: {
        id: asStr(appRaw!['id'])!,
        name: asStr(appRaw!['name'])!,
        version: asStr(appRaw!['version'])!,
      },
      runtime: {
        language: asStr(rtRaw!['language'])!,
        ...(rtRaw!['languageVersion'] !== undefined ? { languageVersion: asStr(rtRaw!['languageVersion'])! } : {}),
        ...(rtRaw!['entrypoint'] !== undefined ? { entrypoint: asStr(rtRaw!['entrypoint'])! } : {}),
      },
      capabilitiesRequired: rawRequired,
      capabilitiesOptional: rawOptional,
      dependencyManagementMode: asStr(depMgmtRaw!['mode'])!,
      resolution: {
        allowMarketplace: asBool(resRaw!['allowMarketplace'])!,
        allowExternalRegistries: asBool(resRaw!['allowExternalRegistries'])!,
        allowLocalPackages: asBool(resRaw!['allowLocalPackages'])!,
      },
      degradation: {
        allowOptionalCapabilityFailure: asBool(degRaw!['allowOptionalCapabilityFailure'])!,
      },
    },
  }
}
