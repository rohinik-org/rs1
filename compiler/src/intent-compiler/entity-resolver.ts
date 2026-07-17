import { randomUUID } from 'node:crypto'
import type { IntentCandidate } from './intent-candidate.js'
import type { CompilerContext } from '../types/compiler-context.js'
import type { IntentEntity } from '../types/intent-ir.js'
import type { ClarificationIR } from '../types/clarification-ir.js'
import type { SessionId, SnapshotId } from '../types/primitives.js'

export type EntityResolutionResult =
  | { readonly ok: true; readonly entities: readonly IntentEntity[] }
  | { readonly ok: false; readonly clarification: ClarificationIR }

export class EntityResolver {
  resolve(candidate: IntentCandidate, ctx: CompilerContext): EntityResolutionResult {
    const entities: IntentEntity[] = []
    const ambiguous: string[] = []

    for (const raw of (candidate.parsedEntities ?? [])) {
      if (raw.name in ctx.session.bindings) {
        entities.push({
          name: raw.name,
          type: this.inferType(raw.inferredType),
          resolved: ctx.session.bindings[raw.name],
          source: 'binding',
          bindingRef: raw.name,
        })
        continue
      }

      const resolved = this.tryResolveLiteral(raw.rawValue)
      if (resolved !== undefined) {
        entities.push({
          name: raw.name,
          type: this.inferType(raw.inferredType),
          resolved,
          source: 'literal',
        })
        continue
      }

      ambiguous.push(raw.name)
    }

    if (ambiguous.length > 0) {
      return { ok: false, clarification: this.makeClarification(ambiguous, ctx.session.sessionId, ctx.system.snapshotId) }
    }

    return { ok: true, entities }
  }

  private inferType(raw?: string): IntentEntity['type'] {
    if (raw && ['path','file','directory','data','value','reference'].includes(raw)) {
      return raw as IntentEntity['type']
    }
    return 'value'
  }

  private tryResolveLiteral(value: string): unknown {
    if (value.startsWith('/') || value.startsWith('./') || value.startsWith('~/') || value.startsWith('~\\')) return value
    const n = Number(value)
    if (!isNaN(n) && value.trim() !== '') return n
    if (value.trim().length > 0) return value
    return undefined
  }

  private makeClarification(ambiguous: string[], sessionId: SessionId, snapshotId: SnapshotId): ClarificationIR {
    const now = new Date().toISOString()
    const id = randomUUID()
    return {
      meta: { artifactId: id, schemaVersion: '1.0', kind: 'ClarificationIR', createdAt: now, producer: '@rohinik-org/compiler@0.1.0' },
      provenance: { systemSnapshotId: snapshotId, parentArtifacts: [], sessionId },
      integrity: { checksum: id },
      lifecycle: { state: 'ACTIVE' },
      originStage: 'intent_compiler',
      reason: { type: 'ambiguous_entity', description: `Cannot resolve: ${ambiguous.join(', ')}`, affectedEntities: ambiguous },
      questions: ambiguous.map((name, i) => ({ questionId: `q-entity-${i}`, text: `What is "${name}"? Please provide a specific path or value.`, required: true })),
      resumePoint: { stage: 'entity_resolution' },
    }
  }
}
