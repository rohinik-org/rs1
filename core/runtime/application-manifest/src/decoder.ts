import { load as yamlLoad, JSON_SCHEMA } from 'js-yaml'
import type { ApplicationManifestDiagnostic } from '@rohinik-org/application-manifest-ir'

export type DecodeResult =
  | { readonly status: 'ok'; readonly doc: Record<string, unknown> }
  | { readonly status: 'error'; readonly diagnostic: ApplicationManifestDiagnostic }

const MAX_SOURCE_BYTES = 1 * 1024 * 1024 // 1 MiB

// JSON_SCHEMA disables YAML-specific type coercions (no Date, no binary, no regexp).
export function decodeManifestYaml(yamlSource: string): DecodeResult {
  if (Buffer.byteLength(yamlSource, 'utf8') > MAX_SOURCE_BYTES) {
    return {
      status: 'error',
      diagnostic: {
        code: 'YAML_PARSE_ERROR',
        severity: 'error',
        message: `Manifest source exceeds maximum size of ${MAX_SOURCE_BYTES} bytes`,
      },
    }
  }

  let raw: unknown
  try {
    raw = yamlLoad(yamlSource, { schema: JSON_SCHEMA })
  } catch (e) {
    return {
      status: 'error',
      diagnostic: {
        code: 'YAML_PARSE_ERROR',
        severity: 'error',
        message: String(e),
      },
    }
  }

  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      status: 'error',
      diagnostic: {
        code: 'INVALID_ROOT_TYPE',
        severity: 'error',
        message: `Manifest root must be a YAML mapping, got: ${Array.isArray(raw) ? 'sequence' : String(raw)}`,
      },
    }
  }

  return { status: 'ok', doc: raw as Record<string, unknown> }
}
