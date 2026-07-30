import type { ConformanceRule, ConformanceSubject, RuleResult, ConformanceIssue } from '../conformance-engine.js'
import { CAPABILITY_ID_PATTERN } from '@rohinik-org/package-manifest-ir'
import type { ProvidedCapabilityDeclaration, ConsumedCapabilityDeclaration } from '@rohinik-org/package-manifest-ir'

// L-9K-003: Capability contract versions must be managed independently of package versions.
// Enforced by requiring valid semver on provided capability versions.

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/

export function createCapabilityRule(): ConformanceRule {
  return {
    ruleId: '9k-capability-version-independence',
    kind: 'static',
    description: 'L-9K-003: capability IDs match pattern, versions are semver, no duplicates',
    async evaluate(subject: ConformanceSubject): Promise<RuleResult> {
      const p = subject.payload as Record<string, unknown>
      const issues: ConformanceIssue[] = []

      const provides = (p.provides ?? []) as readonly ProvidedCapabilityDeclaration[]
      const consumes = (p.consumes ?? []) as readonly ConsumedCapabilityDeclaration[]

      const seenProvided = new Set<string>()
      for (const cap of provides) {
        if (!CAPABILITY_ID_PATTERN.test(cap.capability)) {
          issues.push({
            ruleId: '9k-capability-version-independence',
            severity: 'error',
            code: 'conformance-failed',
            message: `provided capability id "${cap.capability}" does not match CAPABILITY_ID_PATTERN`,
            path: 'provides',
          })
        }
        if (!SEMVER_PATTERN.test(cap.version)) {
          issues.push({
            ruleId: '9k-capability-version-independence',
            severity: 'error',
            code: 'conformance-failed',
            message: `provided capability "${cap.capability}" version "${cap.version}" is not valid semver`,
            path: 'provides',
          })
        }
        if (seenProvided.has(cap.capability)) {
          issues.push({
            ruleId: '9k-capability-version-independence',
            severity: 'error',
            code: 'conformance-failed',
            message: `duplicate provided capability "${cap.capability}"`,
            path: 'provides',
          })
        }
        seenProvided.add(cap.capability)
      }

      const seenConsumed = new Set<string>()
      for (const cap of consumes) {
        if (!CAPABILITY_ID_PATTERN.test(cap.capability)) {
          issues.push({
            ruleId: '9k-capability-version-independence',
            severity: 'error',
            code: 'conformance-failed',
            message: `consumed capability id "${cap.capability}" does not match CAPABILITY_ID_PATTERN`,
            path: 'consumes',
          })
        }
        if (seenConsumed.has(cap.capability)) {
          issues.push({
            ruleId: '9k-capability-version-independence',
            severity: 'error',
            code: 'conformance-failed',
            message: `duplicate consumed capability "${cap.capability}"`,
            path: 'consumes',
          })
        }
        seenConsumed.add(cap.capability)
      }

      const outcome = issues.some(i => i.severity === 'error') ? 'failed' : 'passed'
      return { ruleId: '9k-capability-version-independence', kind: 'static', outcome, issues }
    },
  }
}
