import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import { PACKAGE_ID_PATTERN } from '@rohinik-org/package-manifest-ir'
import type { DependencyDeclarations } from '@rohinik-org/package-manifest-ir'

// L-9K-004: Packages must not depend on resources or capabilities not declared in their manifest.

function fail(ruleId: string, code: string, message: string, path?: string): RuleResult {
  return { ruleId, kind: 'static', outcome: 'failed', issues: [{ ruleId, severity: 'error', code, message, path }] }
}

export function createDependencyRule(): ConformanceRule {
  return {
    ruleId: '9k-dependency-declarations',
    kind: 'static',
    description: 'L-9K-004: rohinik dep IDs match PACKAGE_ID_PATTERN, npm dep names non-empty',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const deps = p.dependencies as DependencyDeclarations | undefined
      if (!deps) {
        return { ruleId: '9k-dependency-declarations', kind: 'static', outcome: 'passed', issues: [] }
      }

      const rohinikDeps = deps.rohinik ?? []
      if (!Array.isArray(rohinikDeps)) {
        return fail('9k-dependency-declarations', 'invalid-input', '`dependencies.rohinik` must be an array', 'dependencies.rohinik')
      }

      const npmDeps = deps.npm ?? []
      if (!Array.isArray(npmDeps)) {
        return fail('9k-dependency-declarations', 'invalid-input', '`dependencies.npm` must be an array', 'dependencies.npm')
      }

      for (const id of rohinikDeps) {
        if (!PACKAGE_ID_PATTERN.test(id)) {
          issues.push({
            ruleId: '9k-dependency-declarations',
            severity: 'error',
            code: 'conformance-failed',
            message: `rohinik dependency id "${id}" does not match PACKAGE_ID_PATTERN`,
            path: 'dependencies.rohinik',
          })
        }
      }

      for (const npm of npmDeps) {
        if (!npm.name || typeof npm.name !== 'string' || npm.name.trim() === '') {
          issues.push({
            ruleId: '9k-dependency-declarations',
            severity: 'error',
            code: 'conformance-failed',
            message: 'npm dependency name must be a non-empty string',
            path: 'dependencies.npm',
          })
        }
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-dependency-declarations', kind: 'static', outcome, issues }
    },
  }
}
