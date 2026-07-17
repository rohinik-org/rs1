import type { CertificationExpectation, CertificationViolation } from '@rohinik-org/compiler'
import { ConstitutionalInvariantRegistry } from './constitutional-invariant.js'

export class CertificationAnalyzer {
  private readonly registry: ConstitutionalInvariantRegistry

  constructor(registry?: ConstitutionalInvariantRegistry) {
    this.registry = registry ?? new ConstitutionalInvariantRegistry()
  }

  analyze(
    scenarioId: string,
    expectations: readonly CertificationExpectation[],
    actualResult: Record<string, unknown>,
  ): CertificationViolation[] {
    const violations: CertificationViolation[] = []

    for (const expectation of expectations) {
      const invariant = this.registry.get(expectation.invariantId)

      if (!invariant) {
        violations.push({
          violationId: crypto.randomUUID(),
          invariantId: expectation.invariantId,
          scenarioId,
          severity: 'WARNING',
          message: `Unknown invariant: ${expectation.invariantId}`,
        })
        continue
      }

      const result = invariant.verify(actualResult)
      if (!result.passed) {
        violations.push({
          violationId: crypto.randomUUID(),
          invariantId: expectation.invariantId,
          scenarioId,
          severity: 'ERROR',
          message: result.message ?? `${expectation.invariantId} failed`,
        })
      }
    }

    return violations
  }
}
