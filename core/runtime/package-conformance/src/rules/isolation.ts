import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import { PACKAGE_ID_PATTERN } from '@rohinik-org/package-manifest-ir'

// L-9K-005: structural isolation — verifies the package id itself matches PACKAGE_ID_PATTERN.
// Cross-package uniqueness requires a registry, not static analysis.
// ponytail: id uniqueness across packages is a registry concern, not static-only; ceiling is single-package check

export function createIsolationRule(): ConformanceRule {
  return {
    ruleId: '9k-package-isolation',
    kind: 'static',
    description: 'L-9K-005: package id matches PACKAGE_ID_PATTERN (structural isolation)',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const pkg = p.package as Record<string, unknown> | undefined
      const id = pkg?.id as string | undefined

      if (!id || !PACKAGE_ID_PATTERN.test(id)) {
        issues.push({
          ruleId: '9k-package-isolation',
          severity: 'error',
          code: 'conformance-failed',
          message: `package.id "${String(id)}" does not match PACKAGE_ID_PATTERN`,
          path: 'package.id',
        })
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-package-isolation', kind: 'static', outcome, issues }
    },
  }
}
