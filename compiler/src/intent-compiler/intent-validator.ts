import { createHash, randomUUID } from 'node:crypto'
import type { IntentCandidate } from './intent-candidate.js'
import type { CompilerContext } from '../types/compiler-context.js'
import type { IntentIR, IntentEntity, IntentConstraint } from '../types/intent-ir.js'
import type { ClarificationIR } from '../types/clarification-ir.js'

export type ValidationResult =
  | { readonly ok: true; readonly intentIR: IntentIR }
  | { readonly ok: false; readonly clarification: ClarificationIR }

export class IntentValidator {
  validate(
    candidate: IntentCandidate,
    entities: readonly IntentEntity[],
    constraints: readonly IntentConstraint[],
    ctx: CompilerContext,
  ): ValidationResult {
    const action = candidate.parsedGoal?.action
    const confidence = candidate.rawConfidence ?? 0

    if (confidence < ctx.policy.clarificationThreshold || !action || action === 'unknown') {
      return { ok: false, clarification: this.makeClarification('low_confidence', `Confidence ${confidence.toFixed(2)} is below threshold ${ctx.policy.clarificationThreshold}. Please rephrase your request.`, ctx) }
    }

    const now = new Date().toISOString()
    const goalBody: Record<string, unknown> = { action }
    if (candidate.parsedGoal?.object != null) goalBody['object'] = candidate.parsedGoal.object
    if (candidate.parsedGoal?.desiredState != null) goalBody['desiredState'] = candidate.parsedGoal.desiredState

    const body = { goal: goalBody, entities, constraints, confidence }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex')

    const intentIR: IntentIR = {
      meta: { artifactId: checksum, schemaVersion: '1.0', kind: 'IntentIR', createdAt: now, producer: '@rohinik-org/compiler@0.1.0' },
      provenance: { systemSnapshotId: ctx.system.snapshotId, parentArtifacts: [], sessionId: ctx.session.sessionId },
      integrity: { checksum },
      lifecycle: { state: 'ACTIVE' },
      goal: goalBody as unknown as IntentIR['goal'],
      entities,
      constraints,
      confidence,
    }

    return { ok: true, intentIR }
  }

  private makeClarification(type: ClarificationIR['reason']['type'], description: string, ctx: CompilerContext): ClarificationIR {
    const now = new Date().toISOString()
    const id = randomUUID()
    return {
      meta: { artifactId: id, schemaVersion: '1.0', kind: 'ClarificationIR', createdAt: now, producer: '@rohinik-org/compiler@0.1.0' },
      provenance: { systemSnapshotId: ctx.system.snapshotId, parentArtifacts: [], sessionId: ctx.session.sessionId },
      integrity: { checksum: id },
      lifecycle: { state: 'ACTIVE' },
      originStage: 'intent_compiler',
      reason: { type, description },
      questions: [{ questionId: 'q-rephrase', text: description, required: true }],
      resumePoint: { stage: 'validation' },
    }
  }
}
