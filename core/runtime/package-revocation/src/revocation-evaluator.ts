import type { RevocationAssessment } from '@rohinik-org/package-trust-ir'
import {
  type RevocationEvaluationRequest,
  type TargetRevocationResult,
  DEFAULT_REVOCATION_POLICY,
  toRevocationAssessment,
} from './types.js'
import { validateRevocationContext } from './revocation-context-validator.js'
import { buildRevocationSubjects } from './revocation-subject-builder.js'
import { RevocationSourceResolver } from './revocation-source-resolver.js'
import { validateRevocationRecord } from './revocation-record-validator.js'
import { evaluateRevocationTime } from './revocation-time-evaluator.js'
import { buildRevocationAssessment } from './assessment-builder.js'

export class RevocationEvaluator {
  evaluate(request: RevocationEvaluationRequest): RevocationAssessment {
    const policy = request.policy ?? DEFAULT_REVOCATION_POLICY
    const ctx = request.context

    // Step 1: Validate context — zero provider calls on invalid context
    const validation = validateRevocationContext(ctx, policy)
    if (!validation.valid) {
      return toRevocationAssessment('insufficient-context', '', validation.reason)
    }

    // Step 2: Build canonical subjects
    const subjects = buildRevocationSubjects(ctx, policy)

    // Step 3: Resolve records via source resolver (no duplicate calls)
    const resolver = new RevocationSourceResolver(request.snapshot)
    const targetResults: TargetRevocationResult[] = []

    for (const subject of subjects) {
      const { entries, available } = resolver.resolve(subject)

      if (!available) {
        targetResults.push({ subject, outcome: 'evidence-unavailable' })
        continue
      }

      if (entries.length === 0) {
        targetResults.push({ subject, outcome: 'not-revoked' })
        continue
      }

      // Step 4: Validate records
      const validEntries = []
      let hasInvalid = false
      for (const entry of entries) {
        const entryValidation = validateRevocationRecord(entry, subject)
        if (!entryValidation.valid) {
          hasInvalid = true
          continue
        }
        validEntries.push(entry)
      }

      if (validEntries.length === 0 && hasInvalid) {
        targetResults.push({ subject, outcome: 'evidence-invalid' })
        continue
      }

      // Step 5: Evaluate time windows
      const effectiveEntries = []
      for (const entry of validEntries) {
        const timeResult = evaluateRevocationTime(entry, ctx.evaluatedAt)
        if (timeResult === 'effective' || timeResult === 'effective-permanent') {
          effectiveEntries.push(entry)
        }
      }

      if (effectiveEntries.length === 0) {
        targetResults.push({ subject, outcome: 'not-revoked' })
        continue
      }

      if (effectiveEntries.length > 1) {
        targetResults.push({ subject, outcome: 'conflicting-evidence', reason: 'multiple-effective-entries' })
        continue
      }

      // Single active revocation
      const firstEntry = effectiveEntries[0]!
      targetResults.push({
        subject,
        outcome: 'revoked',
        revokedAt: firstEntry.revokedAt,
        reason: firstEntry.reason,
        evidenceEntryId: `${firstEntry.targetKind}::${firstEntry.targetId}`,
      })
    }

    return buildRevocationAssessment(
      targetResults,
      request.snapshot?.semanticHash ?? '',
      policy,
    )
  }
}
