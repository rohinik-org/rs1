import { createHash } from 'node:crypto'
import type { RpkArchive } from './build-rpk.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntegrityIssueCode =
  | 'missing-entry'
  | 'unexpected-entry'
  | 'hash-mismatch'
  | 'duplicate-entry'
  | 'traversal-path'
  | 'absolute-path'
  | 'oversized-entry'
  | 'missing-manifest'
  | 'missing-integrity'
  | 'manifest-identity-mismatch'

export interface IntegrityIssue {
  readonly code: IntegrityIssueCode
  readonly path?: string
  readonly message: string
}

export interface InspectionReport {
  readonly valid: boolean
  readonly packageId?: string | undefined
  readonly version?: string | undefined
  readonly artifactDigest: string
  readonly entryCount: number
  readonly issues: readonly IntegrityIssue[]
}

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_ENTRY_BYTES = 50 * 1024 * 1024 // 50 MB per entry
const UNSAFE_PATH = /(?:^|\/)\.\.(?:\/|$)|^\/|:\\/

// ─── inspectRpk ──────────────────────────────────────────────────────────────

export function inspectRpk(archive: RpkArchive): InspectionReport {
  const issues: IntegrityIssue[] = []

  // Archive-bomb + duplicate-entry detection
  const seenPaths = new Set<string>()
  for (const entry of archive.entries) {
    if (seenPaths.has(entry.path)) {
      issues.push({ code: 'duplicate-entry', path: entry.path, message: `duplicate entry "${entry.path}"` })
    }
    seenPaths.add(entry.path)

    if (UNSAFE_PATH.test(entry.path)) {
      issues.push({ code: 'traversal-path', path: entry.path, message: `unsafe path "${entry.path}"` })
    }

    if (entry.content.byteLength > MAX_ENTRY_BYTES) {
      issues.push({ code: 'oversized-entry', path: entry.path, message: `entry "${entry.path}" exceeds size limit` })
    }
  }

  // Required entries
  if (!seenPaths.has('MANIFEST.json')) {
    issues.push({ code: 'missing-manifest', message: 'MANIFEST.json not found in archive' })
  }
  if (!seenPaths.has('INTEGRITY.json')) {
    issues.push({ code: 'missing-integrity', message: 'INTEGRITY.json not found in archive' })
  }

  // If structural issues already found, return early — can't verify integrity
  if (issues.length > 0) {
    return Object.freeze({
      valid: false,
      artifactDigest: archive.artifactDigest,
      entryCount: archive.entries.length,
      issues: Object.freeze(issues.map((i) => Object.freeze(i))),
    })
  }

  // Verify INTEGRITY.json hash entries against actual content
  let integrityData: { algorithm: string; entries: Record<string, string> }
  try {
    integrityData = JSON.parse(archive.integrityJson) as typeof integrityData
  } catch {
    issues.push({ code: 'missing-integrity', message: 'INTEGRITY.json is not valid JSON' })
    return earlyResult(archive, issues)
  }

  const expectedPaths = new Set(Object.keys(integrityData.entries))
  const actualPaths = new Set(archive.entries.map((e) => e.path).filter((p) => p !== 'INTEGRITY.json'))

  // Missing entries (in integrity but not archive)
  for (const p of expectedPaths) {
    if (!actualPaths.has(p) && p !== 'INTEGRITY.json') {
      issues.push({ code: 'missing-entry', path: p, message: `entry "${p}" listed in INTEGRITY.json but not in archive` })
    }
  }

  // Unexpected entries (in archive but not integrity)
  for (const p of actualPaths) {
    if (!expectedPaths.has(p)) {
      issues.push({ code: 'unexpected-entry', path: p, message: `entry "${p}" in archive but not in INTEGRITY.json` })
    }
  }

  // Hash verification
  const entryMap = new Map(archive.entries.map((e) => [e.path, e]))
  for (const [p, expectedHash] of Object.entries(integrityData.entries)) {
    const entry = entryMap.get(p)
    if (!entry) continue
    const actualHash = createHash('sha256').update(entry.content).digest('hex')
    if (actualHash !== expectedHash) {
      issues.push({ code: 'hash-mismatch', path: p, message: `hash mismatch for "${p}"` })
    }
  }

  // Manifest identity: MANIFEST.json content must match archive.manifestJson
  const manifestEntry = entryMap.get('MANIFEST.json')
  if (manifestEntry) {
    const manifestText = Buffer.from(manifestEntry.content).toString('utf8')
    if (manifestText !== archive.manifestJson) {
      issues.push({ code: 'manifest-identity-mismatch', message: 'MANIFEST.json content does not match archive.manifestJson' })
    }
  }

  // Parse manifest for metadata
  let packageId: string | undefined
  let version: string | undefined
  try {
    const parsed = JSON.parse(archive.manifestJson) as { package?: { id?: string; version?: string } }
    packageId = parsed.package?.id
    version = parsed.package?.version
  } catch { /* best-effort */ }

  return Object.freeze({
    valid: issues.length === 0,
    packageId,
    version,
    artifactDigest: archive.artifactDigest,
    entryCount: archive.entries.length,
    issues: Object.freeze(issues.map((i) => Object.freeze(i))),
  })
}

function earlyResult(archive: RpkArchive, issues: IntegrityIssue[]): InspectionReport {
  return Object.freeze({
    valid: false,
    artifactDigest: archive.artifactDigest,
    entryCount: archive.entries.length,
    issues: Object.freeze(issues.map((i) => Object.freeze(i))),
  })
}
