import { createHash } from 'node:crypto'
import type { IntentIR, IntentEntity } from '../types/intent-ir.js'
import type { CapabilitySnapshot } from '../types/capability-snapshot.js'
import type { PlanIR, PlanStep } from '../types/plan-ir.js'
import type { SemanticCapability } from '../types/primitives.js'

export interface Planner {
  plan(intent: IntentIR, capabilities: CapabilitySnapshot): Promise<PlanIR>
}

export class SequentialPlanner implements Planner {
  async plan(intent: IntentIR, capabilities: CapabilitySnapshot): Promise<PlanIR> {
    const steps: PlanStep[] = []
    let ordinal = 0

    const pathEntities = intent.entities.filter(e => e.type === 'path' || e.type === 'directory')
    if (pathEntities.length > 0) {
      steps.push(this.makeDiscoverStep(ordinal++, pathEntities, capabilities))
    }

    const actionStep = this.makeActionStep(ordinal++, intent, capabilities, steps)
    // makeActionStep returns undefined when no skill in CapabilitySnapshot matches
    // the goal action. In v1 this produces a plan without an action step.
    // Stage 4D's SemanticMatcher will provide better coverage.
    if (actionStep) steps.push(actionStep)

    steps.push(this.makeVerifyStep(ordinal++, steps))

    const body = { capabilitySnapshotId: capabilities.snapshotId, steps }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const now = new Date().toISOString()

    return {
      meta: { artifactId: checksum, schemaVersion: '1.0', kind: 'PlanIR', createdAt: now, producer: '@rohinik-org/compiler@0.1.0' },
      provenance: {
        systemSnapshotId: intent.provenance.systemSnapshotId,
        parentArtifacts: [{ artifactId: intent.meta.artifactId, kind: 'IntentIR' }],
        sessionId: intent.provenance.sessionId,
      },
      integrity: { checksum },
      lifecycle: { state: 'ACTIVE' },
      capabilitySnapshotId: capabilities.snapshotId,
      steps,
    }
  }

  private makeDiscoverStep(ordinal: number, entities: readonly IntentEntity[], caps: CapabilitySnapshot): PlanStep {
    const stepId = createHash('sha256')
      .update(`discover:${ordinal}:${entities.map(e => e.name).join(',')}`)
      .digest('hex')
      .slice(0, 32)
    return {
      stepId, ordinal,
      description: `Discover files in ${entities.map(e => String(e.resolved)).join(', ')}`,
      action: 'discover',
      requiredSemantics: ['filesystem.read'] as SemanticCapability[],
      requirements: caps.skills.find(s => s.semantics.includes('filesystem.read'))?.requirements ?? [],
      inputs: entities.map((e, i) => ({ name: `path_${i}`, source: 'intent_entity' as const, ref: e.name })),
      expectedOutput: { type: 'file-list', bindAs: 'discoveredFiles' },
      dependsOn: [],
    }
  }

  private makeActionStep(ordinal: number, intent: IntentIR, caps: CapabilitySnapshot, priorSteps: PlanStep[]): PlanStep | undefined {
    const action = intent.goal.action
    const matching = caps.skills.find(s => s.semantics.some(sem => sem.toLowerCase().includes(action.toLowerCase())))
    if (!matching) return undefined

    const stepId = createHash('sha256')
      .update(`action:${ordinal}:${action}:${matching.skillId}`)
      .digest('hex')
      .slice(0, 32)
    const hasPriorDiscover = priorSteps.some(s => s.action === 'discover')
    return {
      stepId, ordinal,
      description: `${action} ${intent.goal.object ?? 'items'}`,
      action,
      requiredSemantics: matching.semantics.slice(0, 1) as SemanticCapability[],
      requirements: matching.requirements,
      inputs: hasPriorDiscover
        ? [{ name: 'items', source: 'binding' as const, ref: 'discoveredFiles' }]
        : intent.entities.map((e, i) => ({ name: `input_${i}`, source: 'intent_entity' as const, ref: e.name })),
      expectedOutput: { type: 'result', bindAs: 'actionResult' },
      dependsOn: hasPriorDiscover ? [priorSteps[0]!.stepId] : [],
    }
  }

  private makeVerifyStep(ordinal: number, priorSteps: PlanStep[]): PlanStep {
    const stepId = createHash('sha256')
      .update(`verify:${ordinal}:${priorSteps.map(s => s.stepId).join(',')}`)
      .digest('hex')
      .slice(0, 32)
    return {
      stepId, ordinal,
      description: 'Verify execution result',
      action: 'verify',
      requiredSemantics: [],
      requirements: [],
      inputs: [{ name: 'result', source: 'binding' as const, ref: 'actionResult' }],
      expectedOutput: { type: 'verification-summary' },
      dependsOn: priorSteps.length > 0 ? [priorSteps[priorSteps.length - 1]!.stepId] : [],
    }
  }
}
