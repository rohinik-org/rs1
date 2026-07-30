import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import { PACKAGE_MANIFEST_SCHEMA_VERSION } from '@rohinik-org/package-manifest-ir'
import type { RohinikPackageManifestV1 } from '@rohinik-org/package-manifest-ir'

// L-9K-001: Package manifests must declare all provided capabilities, all consumed
// capabilities, all dependencies, all configuration, and all required permissions.

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'schemaVersion', 'package', 'publisher', 'runtime',
  'provides', 'consumes', 'dependencies', 'configuration',
  'permissions', 'health', 'lifecycle', 'metadata',
])

export function createManifestRule(): ConformanceRule {
  return {
    ruleId: '9k-manifest-completeness',
    kind: 'static',
    description: 'L-9K-001: manifest declares schemaVersion, required package fields, and no unknown top-level keys',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      if (p.schemaVersion !== PACKAGE_MANIFEST_SCHEMA_VERSION) {
        issues.push({
          ruleId: '9k-manifest-completeness',
          severity: 'error',
          code: 'conformance-failed',
          message: `schemaVersion must be "${PACKAGE_MANIFEST_SCHEMA_VERSION}", got "${String(p.schemaVersion)}"`,
          path: 'schemaVersion',
        })
      }

      const pkg = p.package as Record<string, unknown> | undefined
      if (!pkg || typeof pkg !== 'object') {
        issues.push({
          ruleId: '9k-manifest-completeness',
          severity: 'error',
          code: 'conformance-failed',
          message: 'package section is required',
          path: 'package',
        })
      } else {
        for (const field of ['id', 'name', 'version', 'type'] as const) {
          if (!pkg[field] || typeof pkg[field] !== 'string') {
            issues.push({
              ruleId: '9k-manifest-completeness',
              severity: 'error',
              code: 'conformance-failed',
              message: `package.${field} is required and must be a non-empty string`,
              path: `package.${field}`,
            })
          }
        }
      }

      // ponytail: unknown-key detection is best-effort static analysis — dynamic keys added at runtime are invisible
      for (const key of Object.keys(p)) {
        if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
          issues.push({
            ruleId: '9k-manifest-completeness',
            severity: 'warning',
            code: 'conformance-failed',
            message: `unknown top-level key "${key}"`,
            path: key,
          })
        }
      }

      const hasErrors = issues.some(i => i.severity === 'error')
      const hasWarnings = issues.some(i => i.severity === 'warning')
      const outcome = hasErrors ? 'failed' : hasWarnings ? 'warned' : 'passed'
      return { ruleId: '9k-manifest-completeness', kind: 'static', outcome, issues }
    },
  }
}
