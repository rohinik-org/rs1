import { createHash } from 'node:crypto'
import type {
  SealedExecutionEvidence,
  RedactionPolicyReference,
  RedactableField,
  RedactedExecutionEvidenceView,
  ViewId,
} from '@rohinik-org/execution-evidence-ir'

let _viewSeq = 0

function computeViewHash(
  source:         SealedExecutionEvidence,
  policy:         RedactionPolicyReference,
  redactedFields: readonly RedactableField[],
  projection:     Readonly<Partial<Omit<SealedExecutionEvidence, 'evidenceHash'>>>,
): string {
  const canonical = JSON.stringify({
    sourceEvidenceId:   source.evidenceId,
    sourceEvidenceHash: source.evidenceHash,
    policyId:           policy.policyId,
    policyHash:         policy.policyHash,
    redactedFields:     [...redactedFields].sort(),
    projectionKeys:     Object.keys(projection).sort(),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export function buildRedactedView(
  source:         SealedExecutionEvidence,
  policy:         RedactionPolicyReference,
  redactedFields: readonly RedactableField[],
): RedactedExecutionEvidenceView {
  const redactSet = new Set<string>(redactedFields)

  // Build projection: all source fields except evidenceHash, producedAt, and redacted ones
  const { evidenceHash: _eh, producedAt: _pa, ...rest } = source
  const projection: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (!redactSet.has(k)) projection[k] = v
  }

  const id       = `view-${++_viewSeq}` as ViewId
  const viewHash = computeViewHash(source, policy, redactedFields, projection as Partial<Omit<SealedExecutionEvidence, 'evidenceHash'>>)

  return Object.freeze({
    viewId:             id,
    sourceEvidenceId:   source.evidenceId,
    sourceEvidenceHash: source.evidenceHash,
    redactionPolicy:    policy,
    redactedFields:     Object.freeze([...redactedFields]),
    projection:         Object.freeze(projection),
    viewHash,
    producedAt:         new Date(),
  }) as RedactedExecutionEvidenceView
}
