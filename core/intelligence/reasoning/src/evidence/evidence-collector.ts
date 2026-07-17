import type { EvidenceSet, NormalizedEvidence, EvidenceReference } from '@rohinik-org/compiler'

export interface EvidenceInput {
  readonly observations?: readonly { id: string; timestamp: string; signals: Record<string, number> }[]
  readonly reflections?: readonly { id: string; status: string; confidence: number }[]
  readonly executions?: readonly { id: string; success: boolean; durationMs: number }[]
  readonly capabilities?: readonly { id: string; successRate: number }[]
}

export class EvidenceCollector {
  collect(input: EvidenceInput): EvidenceSet {
    const items: NormalizedEvidence[] = []

    for (const obs of input.observations ?? []) {
      items.push({ evidenceId: crypto.randomUUID(), artifactType: 'OBSERVATION', artifactId: obs.id, timestamp: obs.timestamp, signals: obs.signals, confidence: 0.8 })
    }
    for (const ref of input.reflections ?? []) {
      items.push({ evidenceId: crypto.randomUUID(), artifactType: 'REFLECTION', artifactId: ref.id, timestamp: new Date().toISOString(), signals: { confidence: ref.confidence }, confidence: ref.confidence })
    }
    for (const exec of input.executions ?? []) {
      items.push({ evidenceId: crypto.randomUUID(), artifactType: 'EXECUTION', artifactId: exec.id, timestamp: new Date().toISOString(), signals: { success: exec.success ? 1 : 0, durationMs: exec.durationMs }, confidence: 0.9 })
    }
    for (const cap of input.capabilities ?? []) {
      items.push({ evidenceId: crypto.randomUUID(), artifactType: 'CAPABILITY', artifactId: cap.id, timestamp: new Date().toISOString(), signals: { successRate: cap.successRate }, confidence: 0.85 })
    }

    return { setId: crypto.randomUUID(), collectedAt: new Date().toISOString(), items }
  }
}

export class EvidenceNormalizer {
  toReference(item: NormalizedEvidence): EvidenceReference {
    return { artifactType: item.artifactType, artifactId: item.artifactId, confidence: item.confidence }
  }

  toReferences(set: EvidenceSet): readonly EvidenceReference[] {
    return set.items.map(i => this.toReference(i))
  }
}

export class EvidenceGraphBuilder {
  build(set: EvidenceSet): Map<string, EvidenceReference[]> {
    const graph = new Map<string, EvidenceReference[]>()
    for (const item of set.items) {
      const key = item.artifactType
      const refs = graph.get(key) ?? []
      refs.push({ artifactType: item.artifactType, artifactId: item.artifactId, confidence: item.confidence })
      graph.set(key, refs)
    }
    return graph
  }
}
