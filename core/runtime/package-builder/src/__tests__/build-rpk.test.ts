import { describe, it, expect } from 'vitest'
import { buildRpk } from '../build-rpk.js'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MANIFEST: RohinikPackageManifestV1 = {
  schemaVersion: 'rohinik.package/v1',
  package: { id: 'com.example.pkg', name: 'Pkg', version: '1.0.0', type: 'capability-provider' },
}

const FILE_A = { path: 'dist/index.js', content: Buffer.from('console.log("hello")') }
const FILE_B = { path: 'dist/utils.js', content: Buffer.from('export {}') }
const BUILT_AT = '2026-01-01T00:00:00.000Z'

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('same input produces identical artifact digest', () => {
    const { receipt: r1 } = buildRpk({ manifest: MANIFEST, files: [FILE_A, FILE_B], builtAt: BUILT_AT })
    const { receipt: r2 } = buildRpk({ manifest: MANIFEST, files: [FILE_B, FILE_A], builtAt: BUILT_AT })
    expect(r1.artifactDigest).toBe(r2.artifactDigest)
  })

  it('file ordering in archive is always sorted by path', () => {
    const { archive } = buildRpk({ manifest: MANIFEST, files: [FILE_B, FILE_A], builtAt: BUILT_AT })
    const paths = archive.entries.map((e) => e.path)
    expect(paths[0]).toBe('MANIFEST.json')
    expect(paths[1]).toBe('INTEGRITY.json')
    const rest = paths.slice(2)
    expect(rest).toEqual([...rest].sort())
  })
})

// ─── Required files ───────────────────────────────────────────────────────────

describe('required entries', () => {
  it('archive contains MANIFEST.json and INTEGRITY.json', () => {
    const { archive } = buildRpk({ manifest: MANIFEST, files: [FILE_A], builtAt: BUILT_AT })
    const paths = archive.entries.map((e) => e.path)
    expect(paths).toContain('MANIFEST.json')
    expect(paths).toContain('INTEGRITY.json')
  })

  it('every file is hashed in INTEGRITY.json', () => {
    const { archive } = buildRpk({ manifest: MANIFEST, files: [FILE_A, FILE_B], builtAt: BUILT_AT })
    const integrity = JSON.parse(archive.integrityJson) as { entries: Record<string, string> }
    expect(integrity.entries['dist/index.js']).toBeDefined()
    expect(integrity.entries['dist/utils.js']).toBeDefined()
    expect(integrity.entries['MANIFEST.json']).toBeDefined()
  })
})

// ─── Content changes alter digest ────────────────────────────────────────────

describe('content integrity', () => {
  it('byte change alters artifact digest', () => {
    const { receipt: r1 } = buildRpk({ manifest: MANIFEST, files: [FILE_A], builtAt: BUILT_AT })
    const modifiedA = { path: FILE_A.path, content: Buffer.from('console.log("world")') }
    const { receipt: r2 } = buildRpk({ manifest: MANIFEST, files: [modifiedA], builtAt: BUILT_AT })
    expect(r1.artifactDigest).not.toBe(r2.artifactDigest)
  })
})

// ─── Path safety ─────────────────────────────────────────────────────────────

describe('path safety', () => {
  it('traversal path fails', () => {
    expect(() =>
      buildRpk({ manifest: MANIFEST, files: [{ path: '../escape.js', content: Buffer.from('') }], builtAt: BUILT_AT })
    ).toThrow()
    let err: unknown
    try {
      buildRpk({ manifest: MANIFEST, files: [{ path: '../x', content: Buffer.from('') }], builtAt: BUILT_AT })
    } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('invalid-input')
  })

  it('absolute path fails', () => {
    expect(() =>
      buildRpk({ manifest: MANIFEST, files: [{ path: '/etc/passwd', content: Buffer.from('') }], builtAt: BUILT_AT })
    ).toThrow()
  })

  it('duplicate path fails', () => {
    let err: unknown
    try {
      buildRpk({ manifest: MANIFEST, files: [FILE_A, FILE_A], builtAt: BUILT_AT })
    } catch (e) { err = e }
    expect((err as { code: string }).code).toBe('validation-failed')
  })
})

// ─── MANIFEST identity ────────────────────────────────────────────────────────

describe('manifest identity', () => {
  it('MANIFEST.json in archive matches input manifest serialization', () => {
    const { archive } = buildRpk({ manifest: MANIFEST, files: [], builtAt: BUILT_AT })
    const entry = archive.entries.find((e) => e.path === 'MANIFEST.json')!
    expect(JSON.parse(Buffer.from(entry.content).toString('utf8'))).toEqual(MANIFEST)
  })
})

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('receipt', () => {
  it('receipt contains packageId, version, artifactDigest, entryCount', () => {
    const { receipt } = buildRpk({ manifest: MANIFEST, files: [FILE_A], builtAt: BUILT_AT })
    expect(receipt.packageId).toBe('com.example.pkg')
    expect(receipt.version).toBe('1.0.0')
    expect(receipt.artifactDigest).toBeTruthy()
    expect(receipt.entryCount).toBeGreaterThan(0)
    expect(receipt.builtAt).toBe(BUILT_AT)
  })
})
