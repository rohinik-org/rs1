import { describe, it, expect } from 'vitest'
import { buildRpk } from '../build-rpk.js'
import { inspectRpk } from '../inspect-rpk.js'
import type { RpkArchive } from '../build-rpk.js'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MANIFEST: RohinikPackageManifestV1 = {
  schemaVersion: 'rohinik.package/v1',
  package: { id: 'com.example.pkg', name: 'Pkg', version: '1.0.0', type: 'capability-provider' },
}
const FILE = { path: 'dist/index.js', content: Buffer.from('export {}') }
const BUILT_AT = '2026-01-01T00:00:00.000Z'

function validArchive(): RpkArchive {
  return buildRpk({ manifest: MANIFEST, files: [FILE], builtAt: BUILT_AT }).archive
}

// ─── Valid archive ────────────────────────────────────────────────────────────

describe('valid archive', () => {
  it('valid archive passes inspection without loading dist/', () => {
    const report = inspectRpk(validArchive())
    expect(report.valid).toBe(true)
    expect(report.issues).toHaveLength(0)
    expect(report.packageId).toBe('com.example.pkg')
  })

  it('inspection report is deterministic', () => {
    const r1 = inspectRpk(validArchive())
    const r2 = inspectRpk(validArchive())
    expect(r1.valid).toBe(r2.valid)
    expect(r1.artifactDigest).toBe(r2.artifactDigest)
  })

  it('report is immutable', () => {
    const report = inspectRpk(validArchive())
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.issues)).toBe(true)
  })
})

// ─── Hash mismatch ────────────────────────────────────────────────────────────

describe('hash mismatch', () => {
  it('one-byte modification fails inspection', () => {
    const archive = validArchive()
    // Tamper: replace dist/index.js content
    const tampered: RpkArchive = {
      ...archive,
      entries: archive.entries.map((e) =>
        e.path === 'dist/index.js'
          ? { path: e.path, content: Buffer.from('tampered') }
          : e,
      ),
    }
    const report = inspectRpk(tampered)
    expect(report.valid).toBe(false)
    expect(report.issues.some((i) => i.code === 'hash-mismatch')).toBe(true)
  })
})

// ─── Missing entry ────────────────────────────────────────────────────────────

describe('missing entry', () => {
  it('missing MANIFEST.json fails', () => {
    const archive = validArchive()
    const noManifest: RpkArchive = {
      ...archive,
      entries: archive.entries.filter((e) => e.path !== 'MANIFEST.json'),
    }
    const report = inspectRpk(noManifest)
    expect(report.valid).toBe(false)
    expect(report.issues.some((i) => i.code === 'missing-manifest')).toBe(true)
  })

  it('missing INTEGRITY.json fails', () => {
    const archive = validArchive()
    const noInteg: RpkArchive = {
      ...archive,
      entries: archive.entries.filter((e) => e.path !== 'INTEGRITY.json'),
    }
    const report = inspectRpk(noInteg)
    expect(report.valid).toBe(false)
    expect(report.issues.some((i) => i.code === 'missing-integrity')).toBe(true)
  })
})

// ─── Duplicate entry ─────────────────────────────────────────────────────────

describe('duplicate entry', () => {
  it('duplicate entry is detected', () => {
    const archive = validArchive()
    const dup: RpkArchive = {
      ...archive,
      entries: [...archive.entries, FILE],
    }
    const report = inspectRpk(dup)
    expect(report.valid).toBe(false)
    expect(report.issues.some((i) => i.code === 'duplicate-entry')).toBe(true)
  })
})

// ─── Traversal ────────────────────────────────────────────────────────────────

describe('traversal path', () => {
  it('traversal entry is rejected', () => {
    const archive = validArchive()
    const traversal: RpkArchive = {
      ...archive,
      entries: [...archive.entries, { path: '../evil.js', content: Buffer.from('') }],
    }
    const report = inspectRpk(traversal)
    expect(report.valid).toBe(false)
    expect(report.issues.some((i) => i.code === 'traversal-path')).toBe(true)
  })
})

// ─── Oversized entry ──────────────────────────────────────────────────────────

describe('oversized entry', () => {
  it('entry exceeding size limit is flagged', () => {
    const archive = validArchive()
    const big: RpkArchive = {
      ...archive,
      entries: [...archive.entries, { path: 'big.bin', content: new Uint8Array(51 * 1024 * 1024) }],
    }
    const report = inspectRpk(big)
    expect(report.issues.some((i) => i.code === 'oversized-entry')).toBe(true)
  })
})

// ─── Manifest identity mismatch ───────────────────────────────────────────────

describe('manifest identity', () => {
  it('manifest content mismatch is detected', () => {
    const archive = validArchive()
    const tampered: RpkArchive = {
      ...archive,
      manifestJson: JSON.stringify({ ...MANIFEST, package: { ...MANIFEST.package, version: '9.9.9' } }, null, 2),
    }
    const report = inspectRpk(tampered)
    expect(report.valid).toBe(false)
    expect(report.issues.some((i) => i.code === 'manifest-identity-mismatch')).toBe(true)
  })
})
