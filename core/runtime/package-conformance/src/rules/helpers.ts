import type { RuleResult } from '../conformance-engine.js'

export function fail(ruleId: string, code: string, message: string, path?: string): RuleResult {
  return { ruleId, kind: 'static', outcome: 'failed', issues: [{ ruleId, severity: 'error', code, message, path }] }
}
