import { createHash } from 'node:crypto'
import type {
  AuthorizedNpmInstallManifest,
} from '@rohinik-org/provisioning-ir'
import { PlanStructureError } from '@rohinik-org/provisioning-ir'

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// ponytail: re-stringify normalizes whitespace — spec requires hash of canonical JSON, not raw string
function semanticHash(canonicalContent: string): string {
  return sha256Hex(JSON.stringify(JSON.parse(canonicalContent)))
}

export class NpmManifestValidator {
  validate(manifest: AuthorizedNpmInstallManifest): void {
    const errs: string[] = []

    if (manifest.ecosystem !== 'npm') {
      errs.push(`ecosystem must be 'npm', got '${manifest.ecosystem}'`)
    }

    if (manifest.lockfileVersion !== 3) {
      errs.push(`lockfileVersion must be 3, got ${manifest.lockfileVersion}`)
    }

    let parsedPkgJson: unknown
    let parsedLockJson: unknown

    try {
      parsedPkgJson = JSON.parse(manifest.packageJsonCanonicalContent)
    } catch {
      errs.push('packageJsonCanonicalContent is not valid JSON')
    }

    try {
      parsedLockJson = JSON.parse(manifest.packageLockCanonicalContent)
    } catch {
      errs.push('packageLockCanonicalContent is not valid JSON')
    }

    if (errs.length > 0) {
      throw new PlanStructureError(errs, errs.join('; '))
    }

    const expectedPkgHash = semanticHash(manifest.packageJsonCanonicalContent)
    if (manifest.packageJsonSemanticHash !== expectedPkgHash) {
      errs.push(`packageJsonSemanticHash mismatch: expected ${expectedPkgHash}`)
    }

    const expectedLockHash = semanticHash(manifest.packageLockCanonicalContent)
    if (manifest.packageLockSemanticHash !== expectedLockHash) {
      errs.push(`packageLockSemanticHash mismatch: expected ${expectedLockHash}`)
    }

    // Validate semanticHash is 64 hex chars
    if (!/^[0-9a-f]{64}$/.test(manifest.semanticHash)) {
      errs.push('semanticHash must be 64 lowercase hex characters')
    }

    // Each packageRecord must have a matching entry in lockfile packages
    if (parsedLockJson !== undefined) {
      const lockPackages = (parsedLockJson as Record<string, unknown>)['packages'] as Record<string, unknown> | undefined
      for (const record of manifest.packageRecords) {
        if (lockPackages !== undefined && !(record.packagePath in lockPackages)) {
          errs.push(`packageRecord '${record.packagePath}' not found in lockfile packages`)
        }
      }
    }

    if (errs.length > 0) {
      throw new PlanStructureError(errs, errs.join('; '))
    }
  }
}
