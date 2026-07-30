// ─── Rule model ───────────────────────────────────────────────────────────────

export type RuleKind = 'static' | 'contract' | 'lifecycle' | 'artifact'
export type Severity = 'error' | 'warning' | 'info'
export type ConformanceOutcome =
  | 'passed'
  | 'failed'
  | 'warned'
  | 'blocked'
  | 'invalid-subject'
  | 'internal-failure'

export interface ConformanceIssue {
  readonly ruleId: string
  readonly severity: Severity
  readonly code: string
  readonly message: string
  readonly path?: string | undefined
}

export interface RuleEvidence {
  readonly ruleId: string
  readonly data: unknown
}

export interface RuleResult {
  readonly ruleId: string
  readonly kind: RuleKind
  readonly outcome: 'passed' | 'failed' | 'warned' | 'blocked' | 'internal-failure'
  readonly issues: readonly ConformanceIssue[]
  readonly evidence?: readonly RuleEvidence[] | undefined
}

// ─── Rule interface ───────────────────────────────────────────────────────────

export interface ConformanceSubject {
  readonly mode: 'source' | 'artifact'
  readonly payload: unknown
}

export interface ConformanceRule {
  readonly ruleId: string
  readonly kind: RuleKind
  readonly description: string
  evaluate(subject: ConformanceSubject): Promise<RuleResult>
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export class ConformanceRuleRegistry {
  private readonly rules = new Map<string, ConformanceRule>()
  private readonly order: string[] = []

  register(rule: ConformanceRule): void {
    if (this.rules.has(rule.ruleId)) {
      throw Object.assign(
        new Error(`validation-failed: duplicate rule id "${rule.ruleId}"`),
        { code: 'validation-failed' as const },
      )
    }
    this.rules.set(rule.ruleId, rule)
    this.order.push(rule.ruleId)
  }

  // Deterministic: registration order, then by ruleId lexicographic
  list(): readonly ConformanceRule[] {
    return this.order.map((id) => this.rules.get(id)!)
  }
}

// ─── Result model ─────────────────────────────────────────────────────────────

export interface ConformanceResult {
  readonly subjectMode: 'source' | 'artifact'
  readonly outcome: ConformanceOutcome
  readonly ruleResults: readonly RuleResult[]
  readonly issues: readonly ConformanceIssue[]
  readonly ranAt: string
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ConformanceEngine {
  constructor(private readonly registry: ConformanceRuleRegistry) {}

  async run(subject: ConformanceSubject, ranAt: string): Promise<ConformanceResult> {
    if (!subject.payload) {
      return Object.freeze({
        subjectMode: subject.mode,
        outcome: 'invalid-subject' as const,
        ruleResults: Object.freeze([]),
        issues: Object.freeze([
          Object.freeze({
            ruleId: 'engine',
            severity: 'error' as const,
            code: 'invalid-input',
            message: 'subject payload is required',
          }),
        ]),
        ranAt,
      })
    }

    const rules = this.registry.list()
    const ruleResults: RuleResult[] = []
    const allIssues: ConformanceIssue[] = []

    // Run all rules — one failure does NOT short-circuit others
    for (const rule of rules) {
      let result: RuleResult
      try {
        result = await rule.evaluate(subject)
      } catch (err) {
        result = Object.freeze({
          ruleId: rule.ruleId,
          kind: rule.kind,
          outcome: 'internal-failure' as const,
          issues: Object.freeze([
            Object.freeze({
              ruleId: rule.ruleId,
              severity: 'error' as const,
              code: 'internal-failure',
              message: `rule threw: ${String(err)}`,
            }),
          ]),
        })
      }
      ruleResults.push(result)
      allIssues.push(...result.issues)
    }

    const outcome = deriveOverallOutcome(ruleResults)

    return Object.freeze({
      subjectMode: subject.mode,
      outcome,
      ruleResults: Object.freeze(ruleResults.map((r) => Object.freeze(r))),
      issues: Object.freeze(allIssues.map((i) => Object.freeze(i))),
      ranAt,
    })
  }
}

function deriveOverallOutcome(results: readonly RuleResult[]): ConformanceOutcome {
  if (results.some((r) => r.outcome === 'internal-failure')) return 'failed'
  if (results.some((r) => r.outcome === 'blocked')) return 'blocked'
  if (results.some((r) => r.outcome === 'failed')) return 'failed'
  if (results.some((r) => r.outcome === 'warned')) return 'warned'
  return 'passed'
}

// ─── Reporters ────────────────────────────────────────────────────────────────

export function reportJson(result: ConformanceResult): string {
  return JSON.stringify(result, null, 2)
}

export function reportText(result: ConformanceResult): string {
  const lines: string[] = []
  lines.push(`Conformance: ${result.outcome.toUpperCase()} [${result.subjectMode}] @ ${result.ranAt}`)
  for (const r of result.ruleResults) {
    lines.push(`  [${r.outcome}] ${r.ruleId}`)
    for (const i of r.issues) {
      lines.push(`    ${i.severity.toUpperCase()}: ${i.message}${i.path ? ` (${i.path})` : ''}`)
    }
  }
  return lines.join('\n')
}
