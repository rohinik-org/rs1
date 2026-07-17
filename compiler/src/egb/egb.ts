import { createHash, randomUUID } from 'node:crypto'
import type { PlanIR } from '../types/plan-ir.js'
import type { ExecutionGraph, ExecutionNode, ExecutionEdge } from '../types/execution-graph.js'

export class ExecutionGraphBuilder {
  build(plan: PlanIR): ExecutionGraph {
    const nodes: ExecutionNode[] = []
    const edges: ExecutionEdge[] = []
    const stepNodeMap = new Map<string, { simNodeId: string; execNodeId: string }>()

    for (const step of plan.steps) {
      const simNodeId = randomUUID()
      const execNodeId = randomUUID()
      stepNodeMap.set(step.stepId, { simNodeId, execNodeId })

      nodes.push({
        nodeId: simNodeId, planStepId: step.stepId,
        command: {
          operation: 'SIMULATE',
          arguments: { content: step.description, contentType: 'TEXT', intentHint: step.action },
          ...(step.requiredSemantics[0] !== undefined ? { expectedCapability: step.requiredSemantics[0] } : {}),
        },
        retryPolicy: { maxRetries: 0, backoffMs: 0, retryOn: [] },
      })

      nodes.push({
        nodeId: execNodeId, planStepId: step.stepId,
        command: {
          operation: 'EXECUTE',
          arguments: { content: step.description, contentType: 'TEXT', intentHint: step.action },
          ...(step.requiredSemantics[0] !== undefined ? { expectedCapability: step.requiredSemantics[0] } : {}),
          constraints: step.requirements,
        },
        retryPolicy: { maxRetries: 2, backoffMs: 500, retryOn: ['RUNTIME_NOT_READY'] },
      })

      edges.push({ fromNodeId: simNodeId, toNodeId: execNodeId, type: 'sequential' })

      for (const depStepId of step.dependsOn) {
        const dep = stepNodeMap.get(depStepId)
        if (dep) {
          edges.push({ fromNodeId: dep.execNodeId, toNodeId: simNodeId, type: 'data_dependency' })
        }
      }
    }

    const body = { nodes, edges }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex')

    return {
      meta: { artifactId: checksum, schemaVersion: '1.0', kind: 'ExecutionGraph', createdAt: new Date().toISOString(), producer: '@rohinik-org/compiler@0.1.0' },
      provenance: {
        systemSnapshotId: plan.provenance.systemSnapshotId,
        parentArtifacts: [{ artifactId: plan.meta.artifactId, kind: 'PlanIR' }],
        sessionId: plan.provenance.sessionId,
      },
      integrity: { checksum },
      lifecycle: { state: 'ACTIVE' },
      nodes,
      edges,
    }
  }
}
