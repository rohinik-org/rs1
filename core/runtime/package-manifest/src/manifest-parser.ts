import type { PackageManifestParseResult } from '@rohinik-org/package-manifest-ir'
import { decodePackageManifestYaml } from './decoder.js'
import { validateStructure } from './structural-validator.js'
import { validateSemantics } from './semantic-validator.js'
import { normalizeManifest } from './normalizer.js'

export function parsePackageManifest(yamlSource: string): PackageManifestParseResult {
  // 1. Decode YAML — JSON_SCHEMA, size limit
  const decoded = decodePackageManifestYaml(yamlSource)
  if (decoded.status === 'error') {
    return { success: false, issues: [{ severity: 'error', code: decoded.code, message: decoded.message }] }
  }

  // 2. Structural validation — unknown fields, type checks
  const structural = validateStructure(decoded.doc)
  if (!structural.valid) {
    return { success: false, issues: structural.issues }
  }

  // 3. Semantic validation — IDs, semver, duplicates, path safety
  const semIssues = validateSemantics(structural.doc)
  if (semIssues.some(i => i.severity === 'error')) {
    return { success: false, issues: semIssues }
  }

  // 4. Normalize → immutable canonical manifest
  const manifest = normalizeManifest(structural.doc)

  return { success: true, manifest }
}
