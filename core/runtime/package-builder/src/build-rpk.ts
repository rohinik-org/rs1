import { createHash } from 'node:crypto'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RpkFileEntry {
  readonly path: string
  readonly content: Uint8Array
}

export interface RpkArchive {
  readonly entries: readonly RpkFileEntry[]
  readonly manifestJson: string
  readonly integrityJson: string
  readonly artifactDigest: string
}

export interface BuildReceipt {
  readonly packageId: string
  readonly version: string
  readonly artifactDigest: string
  readonly entryCount: number
  readonly builtAt: string
}

export interface BuildInput {
  readonly manifest: RohinikPackageManifestV1
  readonly files: readonly { readonly path: string; readonly content: Uint8Array }[]
  readonly builtAt: string
}

// ─── Path safety ─────────────────────────────────────────────────────────────

const UNSAFE_PATH = /(?:^|\/)\.\.(?:\/|$)|^\/|:\\/

function assertSafePath(p: string): void {
  if (!p || UNSAFE_PATH.test(p)) {
    throw Object.assign(
      new Error(`invalid-input: unsafe or absolute path "${p}"`),
      { code: 'invalid-input' as const },
    )
  }
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

function sha256hex(data: Uint8Array | string): string {
  return createHash('sha256')
    .update(typeof data === 'string' ? Buffer.from(data, 'utf8') : data)
    .digest('hex')
}

// ─── buildRpk ────────────────────────────────────────────────────────────────

export function buildRpk(input: BuildInput): { archive: RpkArchive; receipt: BuildReceipt } {
  const { manifest, files, builtAt } = input

  // Validate and deduplicate
  const pathSet = new Set<string>()
  for (const f of files) {
    assertSafePath(f.path)
    if (pathSet.has(f.path)) {
      throw Object.assign(
        new Error(`validation-failed: duplicate path "${f.path}" in build input`),
        { code: 'validation-failed' as const },
      )
    }
    pathSet.add(f.path)
  }

  // Deterministic ordering: sort by path
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path, 'en', { sensitivity: 'base' }))

  // Canonical MANIFEST.json — deterministic serialization
  const manifestJson = JSON.stringify(manifest, null, 2)
  const manifestEntry: RpkFileEntry = {
    path: 'MANIFEST.json',
    content: Buffer.from(manifestJson, 'utf8'),
  }

  // INTEGRITY.json — SHA-256 of every file (sorted paths)
  const integrityMap: Record<string, string> = {}
  for (const f of sorted) {
    integrityMap[f.path] = sha256hex(f.content)
  }
  integrityMap['MANIFEST.json'] = sha256hex(manifestEntry.content)

  // Sort integrity map keys for determinism
  const integrityOrdered = Object.fromEntries(
    Object.keys(integrityMap).sort().map((k) => [k, integrityMap[k]!]),
  )
  const integrityJson = JSON.stringify({ algorithm: 'sha256', entries: integrityOrdered }, null, 2)
  const integrityEntry: RpkFileEntry = {
    path: 'INTEGRITY.json',
    content: Buffer.from(integrityJson, 'utf8'),
  }

  // Artifact digest = SHA-256 of INTEGRITY.json
  const artifactDigest = sha256hex(integrityEntry.content)

  const entries: RpkFileEntry[] = [
    manifestEntry,
    integrityEntry,
    ...sorted,
  ]

  const archive: RpkArchive = Object.freeze({
    entries: Object.freeze(entries),
    manifestJson,
    integrityJson,
    artifactDigest,
  })

  const receipt: BuildReceipt = Object.freeze({
    packageId: manifest.package.id,
    version: manifest.package.version,
    artifactDigest,
    entryCount: entries.length,
    builtAt,
  })

  return { archive, receipt }
}
