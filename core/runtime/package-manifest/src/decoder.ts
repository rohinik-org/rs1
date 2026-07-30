import { load as yamlLoad, JSON_SCHEMA } from 'js-yaml'
import type { PackageManifestErrorCode, ManifestValidationIssue } from '@rohinik-org/package-manifest-ir'

export type DecodeResult =
  | { readonly status: 'ok'; readonly doc: Record<string, unknown> }
  | { readonly status: 'error'; readonly code: PackageManifestErrorCode; readonly message: string }

// Package manifests are small — 64 KiB is generous.
// ponytail: JSON_SCHEMA prevents Date/binary/regexp coercions; does NOT prevent all duplicate keys
const MAX_SOURCE_BYTES = 64 * 1024

export function decodePackageManifestYaml(yamlSource: string): DecodeResult {
  if (Buffer.byteLength(yamlSource, 'utf8') > MAX_SOURCE_BYTES) {
    return {
      status: 'error',
      code: 'invalid-input',
      message: `Manifest source exceeds maximum size of ${MAX_SOURCE_BYTES} bytes`,
    }
  }

  let raw: unknown
  try {
    raw = yamlLoad(yamlSource, { schema: JSON_SCHEMA })
  } catch (e) {
    return { status: 'error', code: 'invalid-input', message: String(e) }
  }

  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      status: 'error',
      code: 'invalid-input',
      message: `Manifest root must be a YAML mapping, got: ${Array.isArray(raw) ? 'sequence' : String(raw)}`,
    }
  }

  return { status: 'ok', doc: raw as Record<string, unknown> }
}
