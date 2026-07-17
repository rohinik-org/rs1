import { createHash, randomUUID } from 'node:crypto'
import type { ExecutionGraph } from '../types/execution-graph.js'
import type { VerificationReport, VerificationFinding, SimulationRecord } from '../types/verification-report.js'

interface SimulateResponse {
  requestId: string
  wouldRoute: boolean
  selectedTier?: string
  selectedSkill?: string
  confidence: number
  estimatedLatencyMs: number
  reasoningWouldBeInvoked: boolean
  candidatesConsidered: unknown[]
}

export class Verifier {
  constructor(private readonly baseUrl: string) {}

  async verify(graph: ExecutionGraph): Promise<VerificationReport> {
    const findings: VerificationFinding[] = []
    const simulations: SimulationRecord[] = []

    const simNodes = graph.nodes.filter(n => n.command.operation === 'SIMULATE')

    for (const node of simNodes) {
      const res = await fetch(`${this.baseUrl}/v1/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(node.command.arguments),
      })
      if (!res.ok) {
        throw new Error(`Verifier: POST /v1/simulate returned HTTP ${res.status} for node ${node.nodeId}`)
      }
      const data = await res.json() as SimulateResponse

      simulations.push({
        nodeId: node.nodeId, requestId: data.requestId, response: data,
        status: data.wouldRoute ? 'SAFE' : 'FAILED',
        wouldRoute: data.wouldRoute,
        ...(data.selectedTier !== undefined ? { selectedTier: data.selectedTier } : {}),
        ...(data.selectedSkill !== undefined ? { selectedSkill: data.selectedSkill } : {}),
        confidence: data.confidence,
      })

      if (!data.wouldRoute) {
        findings.push({
          findingId: randomUUID(), severity: 'ERROR', rule: 'routability',
          message: `Step ${node.planStepId} would not route: no capable skill found`,
          affectedNodeId: node.nodeId,
        })
      } else if (data.confidence < 0.7) {
        findings.push({
          findingId: randomUUID(), severity: 'WARN', rule: 'confidence',
          message: `Step ${node.planStepId} has low confidence: ${data.confidence}`,
          affectedNodeId: node.nodeId,
        })
      }
    }

    const hasErrors = findings.some(f => f.severity === 'ERROR')
    const hasWarnings = findings.some(f => f.severity === 'WARN')
    const status = hasErrors ? 'FAILED' : hasWarnings ? 'REQUIRES_CONFIRMATION' : 'PASSED'

    const body = { status, findings, simulations }
    const checksum = createHash('sha256').update(JSON.stringify(body)).digest('hex')

    return {
      meta: { artifactId: checksum, schemaVersion: '1.0', kind: 'VerificationReport', createdAt: new Date().toISOString(), producer: '@rohinik-org/compiler@0.1.0' },
      provenance: {
        systemSnapshotId: graph.provenance.systemSnapshotId,
        parentArtifacts: [{ artifactId: graph.meta.artifactId, kind: 'ExecutionGraph' }],
        sessionId: graph.provenance.sessionId,
      },
      integrity: { checksum },
      lifecycle: { state: 'ACTIVE' },
      status, findings, simulations,
    }
  }
}
