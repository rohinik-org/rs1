import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import type { PermissionDeclarations, NetworkAccessRule } from '@rohinik-org/package-manifest-ir'

// L-9K-005: Packages must not directly access external resources without declared permissions.

function fail(ruleId: string, code: string, message: string, path?: string): RuleResult {
  return { ruleId, kind: 'static', outcome: 'failed', issues: [{ ruleId, severity: 'error', code, message, path }] }
}

export function createPermissionRule(): ConformanceRule {
  return {
    ruleId: '9k-permission-declarations',
    kind: 'static',
    description: 'L-9K-005: network rules have non-empty host, no duplicate outbound host keys',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const perms = p.permissions as PermissionDeclarations | undefined
      if (!perms) {
        return { ruleId: '9k-permission-declarations', kind: 'static', outcome: 'passed', issues: [] }
      }

      const checkNetworkRules = (rules: readonly NetworkAccessRule[], path: string) => {
        const seen = new Set<string>()
        for (const rule of rules) {
          if (!rule.host || typeof rule.host !== 'string' || rule.host.trim() === '') {
            issues.push({
              ruleId: '9k-permission-declarations',
              severity: 'error',
              code: 'conformance-failed',
              message: `${path} rule has empty or missing host`,
              path,
            })
          } else {
            if (seen.has(rule.host)) {
              issues.push({
                ruleId: '9k-permission-declarations',
                severity: 'error',
                code: 'conformance-failed',
                message: `duplicate ${path} host "${rule.host}"`,
                path,
              })
            }
            seen.add(rule.host)
          }
        }
      }

      if (perms.network?.outbound) {
        if (!Array.isArray(perms.network.outbound)) {
          return fail('9k-permission-declarations', 'invalid-input', '`permissions.network.outbound` must be an array', 'permissions.network.outbound')
        }
        checkNetworkRules(perms.network.outbound, 'permissions.network.outbound')
      }
      if (perms.network?.inbound) {
        if (!Array.isArray(perms.network.inbound)) {
          return fail('9k-permission-declarations', 'invalid-input', '`permissions.network.inbound` must be an array', 'permissions.network.inbound')
        }
        checkNetworkRules(perms.network.inbound, 'permissions.network.inbound')
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-permission-declarations', kind: 'static', outcome, issues }
    },
  }
}
