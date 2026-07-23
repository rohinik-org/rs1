import { clampScore, QualityDimension } from '@rohinik-org/context-quality-ir'
import type { ContextItem, ConsumerContextProfile, QualityWarning } from '@rohinik-org/context-quality-ir'

const SUSPICIOUS_PATH_PATTERNS = [
  /secrets?\//i,
  /credentials?\//i,
  /api[\-_]?keys?\//i,
  /private[\-_]?key/i,
]

export interface SafetyResult {
  readonly score:    number
  readonly blocked:  boolean
  readonly reasons:  readonly string[]
  readonly warnings: readonly QualityWarning[]
}

export class SafetyEvaluator {
  evaluate(items: readonly ContextItem[], consumer: ConsumerContextProfile | null): SafetyResult {
    const reasons:  string[]        = []
    const warnings: QualityWarning[] = []

    for (const item of items) {
      const sec = item.security

      if (sec.containsSecrets) {
        reasons.push(`Item ${item.itemId} containsSecrets=true`)
      }

      if (sec.redactionState === 'incomplete') {
        reasons.push(`Item ${item.itemId} redactionState=incomplete`)
      }

      if (consumer) {
        if (sec.tenantId && consumer.tenantId && sec.tenantId !== consumer.tenantId) {
          reasons.push(`Item ${item.itemId} tenant mismatch: item=${sec.tenantId} consumer=${consumer.tenantId}`)
        }

        if (sec.allowedPrincipals && sec.allowedPrincipals.length > 0 && consumer.principalId) {
          if (!sec.allowedPrincipals.includes(consumer.principalId)) {
            reasons.push(`Item ${item.itemId} principal '${consumer.principalId}' not in allowedPrincipals`)
          }
        }

        if (sec.allowedConsumerKinds && sec.allowedConsumerKinds.length > 0) {
          if (!sec.allowedConsumerKinds.includes(consumer.consumerKind)) {
            reasons.push(`Item ${item.itemId} consumerKind '${consumer.consumerKind}' not in allowedConsumerKinds`)
          }
        }

        if (consumer.executionLocation === 'remote' && !sec.externalDisclosureAllowed) {
          reasons.push(`Item ${item.itemId} externalDisclosureAllowed=false but executionLocation=remote`)
        }

        if (sec.residency && sec.residency.length > 0 && consumer.residency) {
          if (!sec.residency.includes(consumer.residency)) {
            reasons.push(`Item ${item.itemId} consumer residency '${consumer.residency}' not in allowed residency`)
          }
        }

        const CLASSIFICATION_RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 }
        if (consumer.maximumClassification) {
          const itemRank     = CLASSIFICATION_RANK[sec.classification] ?? 0
          const consumerRank = CLASSIFICATION_RANK[consumer.maximumClassification] ?? 3
          if (itemRank > consumerRank) {
            reasons.push(`Item ${item.itemId} classification '${sec.classification}' exceeds consumer maximum '${consumer.maximumClassification}'`)
          }
        }

        if (!consumer.supportedRepresentations.includes(item.representation)) {
          reasons.push(`Item ${item.itemId} representation '${item.representation}' not in consumer supportedRepresentations`)
        }
      }

      for (const pattern of SUSPICIOUS_PATH_PATTERNS) {
        if (pattern.test(item.sourceRef)) {
          warnings.push({
            dimension: QualityDimension.SAFETY,
            message:   `Item ${item.itemId} sourceRef matches suspicious path pattern: ${item.sourceRef}`,
            itemId:    item.itemId,
          })
          break
        }
      }
    }

    if (reasons.length > 0) {
      return { score: 0.0, blocked: true, reasons, warnings }
    }
    return { score: 1.0, blocked: false, reasons: [], warnings }
  }
}
