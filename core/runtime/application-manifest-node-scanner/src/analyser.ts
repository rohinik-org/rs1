import type { ApplicationManifest, ApplicationManifestDiagnostic } from '@rohinik-org/application-manifest-ir'
import type { ScanResult } from './scanner.js'

export interface AnalysisResult {
  readonly diagnostics: readonly ApplicationManifestDiagnostic[]
}

export function analyseUsages(
  manifest: ApplicationManifest,
  scanResults: readonly ScanResult[],
): AnalysisResult {
  const declared = new Set<string>([
    ...manifest.capabilities.required.map(d => d.capabilityId),
    ...manifest.capabilities.optional.map(d => d.capabilityId),
  ])

  const diagnostics: ApplicationManifestDiagnostic[] = []

  for (const scan of scanResults) {
    if (scan.parseFailure) {
      diagnostics.push({
        code: scan.parseFailure.code,
        severity: 'info',
        message: scan.parseFailure.message,
        path: scan.sourcePath,
      })
      continue
    }

    for (const usage of scan.usages) {
      if (!declared.has(usage.capabilityId)) {
        diagnostics.push({
          code: 'UNDECLARED_CAPABILITY_USAGE',
          severity: 'warning',
          message: `Capability '${usage.capabilityId}' used in source but not declared in manifest`,
          path: scan.sourcePath,
          range: { line: usage.line, column: usage.column },
        })
      }
    }

    for (const invalid of scan.invalidLiteralUsages) {
      diagnostics.push({
        code: 'INVALID_CAPABILITY_USAGE_LITERAL',
        severity: 'warning',
        message: `Invalid capability ID literal '${invalid.literal}' — does not match capability ID pattern`,
        path: scan.sourcePath,
        range: { line: invalid.line, column: invalid.column },
      })
    }

    for (const dynamic of scan.indeterminateUsages) {
      diagnostics.push({
        code: 'DYNAMIC_CAPABILITY_USAGE',
        severity: 'info',
        message: `Dynamic capability() call — cannot statically determine capability ID`,
        path: scan.sourcePath,
        range: { line: dynamic.line, column: dynamic.column },
      })
    }
  }

  return { diagnostics }
}
