/**
 * Validate an install manifest. Returns a typed result — throws nothing.
 *
 * The CLI calls this after reading rohinik-manifest.json from disk.
 * If validation fails, the runtime must not be activated.
 */

import type { InstallManifest } from './manifest.js'
import { MANIFEST_SCHEMA_VERSION } from './manifest.js'

export type ManifestValidationResult =
  | { ok: true;  manifest: InstallManifest }
  | { ok: false; errors: readonly string[] }

const REQUIRED_KEYS: ReadonlyArray<keyof InstallManifest> = [
  'schemaVersion', 'runtimeVersion', 'releaseChannel', 'platform',
  'entrypoint', 'protocols', 'integrity', 'config',
  'minimumRequirements', 'cliCompatibility', 'installedAt', 'includedPackages',
]

const VALID_OS     = new Set(['linux', 'darwin', 'win32'])
const VALID_ARCH   = new Set(['x64', 'arm64'])
const VALID_CHAN   = new Set(['stable', 'beta', 'nightly'])
const SEMVER_RE    = /^\d+\.\d+\.\d+/

export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['manifest must be a JSON object'] }
  }

  const m = raw as Record<string, unknown>

  for (const key of REQUIRED_KEYS) {
    if (!(key in m)) errors.push(`missing required field: ${key}`)
  }

  if (m['schemaVersion'] !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${MANIFEST_SCHEMA_VERSION}", got "${m['schemaVersion']}"`)
  }

  if (typeof m['runtimeVersion'] !== 'string' || !SEMVER_RE.test(m['runtimeVersion'])) {
    errors.push(`runtimeVersion must be a semver string`)
  }

  if (typeof m['releaseChannel'] !== 'string' || !VALID_CHAN.has(m['releaseChannel'])) {
    errors.push(`releaseChannel must be one of: stable, beta, nightly`)
  }

  const plat = m['platform']
  if (typeof plat !== 'object' || plat === null) {
    errors.push('platform must be an object')
  } else {
    const p = plat as Record<string, unknown>
    if (!VALID_OS.has(p['os'] as string))   errors.push(`platform.os must be one of: linux, darwin, win32`)
    if (!VALID_ARCH.has(p['arch'] as string)) errors.push(`platform.arch must be one of: x64, arm64`)
  }

  if (typeof m['entrypoint'] !== 'string' || !m['entrypoint']) {
    errors.push('entrypoint must be a non-empty string')
  }

  const proto = m['protocols']
  if (typeof proto !== 'object' || proto === null) {
    errors.push('protocols must be an object')
  } else {
    const p = proto as Record<string, unknown>
    for (const k of ['execution', 'agent', 'control'] as const) {
      if (typeof p[k] !== 'string' || !SEMVER_RE.test(p[k] as string)) {
        errors.push(`protocols.${k} must be a semver string`)
      }
    }
  }

  const integ = m['integrity']
  if (typeof integ !== 'object' || integ === null) {
    errors.push('integrity must be an object')
  } else {
    const i = integ as Record<string, unknown>
    if (i['algorithm'] !== 'sha256')             errors.push('integrity.algorithm must be "sha256"')
    if (typeof i['artifactHash'] !== 'string' || !/^[0-9a-f]{64}$/i.test(i['artifactHash'] as string)) {
      errors.push('integrity.artifactHash must be a 64-character hex string')
    }
  }

  const compat = m['cliCompatibility']
  if (typeof compat !== 'object' || compat === null) {
    errors.push('cliCompatibility must be an object')
  } else {
    const c = compat as Record<string, unknown>
    if (typeof c['minCliVersion'] !== 'string' || !SEMVER_RE.test(c['minCliVersion'] as string)) {
      errors.push('cliCompatibility.minCliVersion must be a semver string')
    }
    if (c['maxCliVersion'] !== undefined && (typeof c['maxCliVersion'] !== 'string' || !SEMVER_RE.test(c['maxCliVersion'] as string))) {
      errors.push('cliCompatibility.maxCliVersion must be a semver string when present')
    }
  }

  if (typeof m['installedAt'] !== 'string' || Number.isNaN(Date.parse(m['installedAt'] as string))) {
    errors.push('installedAt must be an ISO-8601 timestamp string')
  }

  if (!Array.isArray(m['includedPackages'])) {
    errors.push('includedPackages must be an array')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, manifest: raw as InstallManifest }
}

/**
 * Check whether a given CLI version is compatible with a manifest.
 * Returns null if compatible, or a human-readable rejection message.
 */
export function checkCliCompatibility(manifest: InstallManifest, cliVersion: string): string | null {
  const { minCliVersion, maxCliVersion } = manifest.cliCompatibility

  if (!meetsMinimum(cliVersion, minCliVersion)) {
    return `CLI ${cliVersion} is too old for runtime ${manifest.runtimeVersion}. Minimum CLI: ${minCliVersion}. Run: npm update -g @rohinik-org/cli`
  }

  if (maxCliVersion !== undefined && exceedsMaximum(cliVersion, maxCliVersion)) {
    return `CLI ${cliVersion} is too new for runtime ${manifest.runtimeVersion}. Maximum tested CLI: ${maxCliVersion}. Run: rohinik upgrade`
  }

  return null
}

/** Simple semver comparison — major.minor.patch only, ignores pre-release. */
function parseSemver(v: string): [number, number, number] {
  const [maj = 0, min = 0, pat = 0] = v.replace(/[^0-9.]/g, '').split('.').map(Number)
  return [maj, min, pat]
}

function semverCompare(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseSemver(a)
  const [bMaj, bMin, bPat] = parseSemver(b)
  return aMaj !== bMaj ? aMaj - bMaj : aMin !== bMin ? aMin - bMin : aPat - bPat
}

function meetsMinimum(cli: string, min: string): boolean { return semverCompare(cli, min) >= 0 }
function exceedsMaximum(cli: string, max: string): boolean { return semverCompare(cli, max) > 0 }
