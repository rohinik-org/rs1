import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { validateManifest, checkCliCompatibility, resolveHome, MANIFEST_SCHEMA_VERSION } from '../index.js'
import type { InstallManifest } from '../index.js'

function validManifest(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    schemaVersion:      MANIFEST_SCHEMA_VERSION,
    runtimeVersion:     '0.16.0-beta.1',
    releaseChannel:     'beta',
    platform:           { os: 'linux', arch: 'x64' },
    entrypoint:         'bin/rhks.js',
    protocols:          { execution: '1.0.0', agent: '1.0.0', control: '1.0.0' },
    integrity:          { algorithm: 'sha256', artifactHash: 'a'.repeat(64) },
    config:             { schemaVersion: '1', defaultFile: 'rohinik.yaml' },
    minimumRequirements: { node: '>=22.0.0' },
    cliCompatibility:   { minCliVersion: '0.16.0' },
    installedAt:        '2026-08-10T00:00:00.000Z',
    includedPackages:   [],
    ...overrides,
  }
}

// ── validateManifest ──────────────────────────────────────────────────────────

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    const result = validateManifest(validManifest())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest.runtimeVersion).toBe('0.16.0-beta.1')
      expect(result.manifest.entrypoint).toBe('bin/rhks.js')
    }
  })

  it('accepts stable and nightly channels', () => {
    expect(validateManifest(validManifest({ releaseChannel: 'stable' })).ok).toBe(true)
    expect(validateManifest(validManifest({ releaseChannel: 'nightly' })).ok).toBe(true)
  })

  it('accepts win32/darwin platforms', () => {
    expect(validateManifest(validManifest({ platform: { os: 'win32', arch: 'x64' } })).ok).toBe(true)
    expect(validateManifest(validManifest({ platform: { os: 'darwin', arch: 'arm64' } })).ok).toBe(true)
  })

  it('accepts maxCliVersion when present', () => {
    const m = validManifest({ cliCompatibility: { minCliVersion: '0.16.0', maxCliVersion: '0.18.0' } })
    expect(validateManifest(m).ok).toBe(true)
  })

  it('rejects non-object input', () => {
    const r = validateManifest('not an object')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/JSON object/)
  })

  it('rejects wrong schemaVersion', () => {
    const r = validateManifest(validManifest({ schemaVersion: '2' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some(e => e.includes('schemaVersion'))).toBe(true)
  })

  it('rejects missing required field', () => {
    const m = validManifest() as Record<string, unknown>
    delete m['entrypoint']
    const r = validateManifest(m)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some(e => e.includes('entrypoint'))).toBe(true)
  })

  it('rejects invalid platform.os', () => {
    const r = validateManifest(validManifest({ platform: { os: 'freebsd', arch: 'x64' } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some(e => e.includes('platform.os'))).toBe(true)
  })

  it('rejects non-hex artifactHash', () => {
    const r = validateManifest(validManifest({ integrity: { algorithm: 'sha256', artifactHash: 'short' } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.some(e => e.includes('artifactHash'))).toBe(true)
  })

  it('rejects invalid integrity algorithm', () => {
    const r = validateManifest(validManifest({ integrity: { algorithm: 'md5', artifactHash: 'a'.repeat(64) } }))
    expect(r.ok).toBe(false)
  })

  it('rejects non-semver protocol version', () => {
    const r = validateManifest(validManifest({ protocols: { execution: 'v1', agent: '1.0.0', control: '1.0.0' } }))
    expect(r.ok).toBe(false)
  })

  it('rejects invalid installedAt timestamp', () => {
    const r = validateManifest(validManifest({ installedAt: 'not-a-date' }))
    expect(r.ok).toBe(false)
  })

  it('rejects invalid releaseChannel', () => {
    const r = validateManifest(validManifest({ releaseChannel: 'canary' }))
    expect(r.ok).toBe(false)
  })

  it('collects multiple errors', () => {
    const r = validateManifest(validManifest({ schemaVersion: '9', releaseChannel: 'bad', entrypoint: '' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2)
  })
})

// ── checkCliCompatibility ────────────────────────────────────────────────────

describe('checkCliCompatibility', () => {
  function manifest(min: string, max?: string): InstallManifest {
    const m = validManifest({
      cliCompatibility: max !== undefined
        ? { minCliVersion: min, maxCliVersion: max }
        : { minCliVersion: min },
    })
    const r = validateManifest(m)
    if (!r.ok) throw new Error('bad test manifest: ' + r.errors.join(', '))
    return r.manifest
  }

  it('returns null when CLI version meets minimum', () => {
    expect(checkCliCompatibility(manifest('0.16.0'), '0.16.0')).toBeNull()
    expect(checkCliCompatibility(manifest('0.16.0'), '0.17.0')).toBeNull()
    expect(checkCliCompatibility(manifest('0.16.0'), '1.0.0')).toBeNull()
  })

  it('returns error when CLI is below minimum', () => {
    const msg = checkCliCompatibility(manifest('0.16.0'), '0.15.9')
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/too old/)
  })

  it('returns null when CLI is within range', () => {
    expect(checkCliCompatibility(manifest('0.16.0', '0.18.0'), '0.17.0')).toBeNull()
    expect(checkCliCompatibility(manifest('0.16.0', '0.18.0'), '0.18.0')).toBeNull()
  })

  it('returns error when CLI exceeds maximum', () => {
    const msg = checkCliCompatibility(manifest('0.16.0', '0.18.0'), '0.19.0')
    expect(msg).not.toBeNull()
    expect(msg).toMatch(/too new/)
  })

  it('returns null when no maxCliVersion and CLI is far ahead', () => {
    expect(checkCliCompatibility(manifest('0.16.0'), '9.99.0')).toBeNull()
  })
})

// ── resolveHome ───────────────────────────────────────────────────────────────

describe('resolveHome', () => {
  it('explicit root overrides env', () => {
    const root = join('/custom', 'root')
    const h = resolveHome(root)
    expect(h.root).toBe(root)
    expect(h.config).toBe(join(root, 'config'))
    expect(h.runtimes).toBe(join(root, 'runtimes'))
    expect(h.state).toBe(join(root, 'state'))
    expect(h.packages).toBe(join(root, 'packages'))
    expect(h.cache).toBe(join(root, 'cache'))
    expect(h.logs).toBe(join(root, 'logs'))
  })

  it('ROHINIK_HOME env var is respected', () => {
    const saved = process.env['ROHINIK_HOME']
    const envRoot = join('/env', 'home')
    process.env['ROHINIK_HOME'] = envRoot
    try {
      const h = resolveHome()
      expect(h.root).toBe(envRoot)
    } finally {
      if (saved === undefined) delete process.env['ROHINIK_HOME']
      else process.env['ROHINIK_HOME'] = saved
    }
  })

  it('all subdirs are direct children of root', () => {
    const root = join('/r')
    const h = resolveHome(root)
    for (const key of ['runtimes', 'config', 'state', 'packages', 'cache', 'logs'] as const) {
      expect(h[key].startsWith(root)).toBe(true)
    }
  })
})
