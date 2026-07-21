import type {
  KnowledgeFragment,
  KnowledgeQuery,
  KnowledgeQueryResult,
  KnowledgeNode,
  KnowledgeEdge,
  ProcedureDefinition,
  ProcedureFilter,
  EntityFilter,
} from './knowledge-ir.js'
import { KnowledgeRegistry, SemanticIndex } from './knowledge-registry.js'

export interface KnowledgeExtractionPipeline {
  extract(filePath: string, content: string): KnowledgeFragment
}

export interface WorkflowLearner {
  learnFromExecutions(executionIds: string[]): Promise<unknown>
}

export interface InferenceRunner {
  run(): Promise<unknown>
}

export interface SkillClassification {
  classify(fragment: KnowledgeFragment): unknown[]
}

export class KnowledgeService {
  constructor(
    private readonly registry: KnowledgeRegistry,
    private readonly index: SemanticIndex,
    private readonly pipeline: KnowledgeExtractionPipeline,
    private readonly classifier: SkillClassification,
  ) {}

  async extract(filePath: string, content: string | Buffer): Promise<KnowledgeFragment> {
    const text = typeof content === 'string' ? content : content.toString('utf8')
    const fragment = this.pipeline.extract(filePath, text)
    this.registry.register(fragment)
    return fragment
  }

  async query(q: KnowledgeQuery): Promise<KnowledgeQueryResult> {
    const nodes: KnowledgeNode[] = []
    if (q.primitive) nodes.push(...this.index.findByPrimitive(q.primitive))
    else if (q.kind) nodes.push(...this.index.findByKind(q.kind))
    else if (q.label) nodes.push(...this.index.findByLabel(q.label))
    else nodes.push(...this.index.findByPrimitive('Entity'))

    const nodeIds = new Set(nodes.map(n => n.id))
    const edges: KnowledgeEdge[] = []
    for (const edge of this.registry.allEdges()) {
      if (q.relationship && edge.relationship !== q.relationship) continue
      if (nodeIds.has(edge.sourceNodeId) || nodeIds.has(edge.targetNodeId)) edges.push(edge)
    }
    return { nodes, edges }
  }

  async findProcedures(filter?: ProcedureFilter): Promise<ReadonlyArray<ProcedureDefinition>> {
    return this.index.findProcedures(filter)
  }

  async findEntities(filter?: EntityFilter): Promise<ReadonlyArray<KnowledgeNode>> {
    return this.index.findEntities(filter)
  }

  async findRelationships(nodeId: string): Promise<ReadonlyArray<KnowledgeEdge>> {
    return this.registry.allEdges().filter(
      e => e.sourceNodeId === nodeId || e.targetNodeId === nodeId
    )
  }

  async classify(fragment: KnowledgeFragment): Promise<unknown[]> {
    return this.classifier.classify(fragment)
  }
}
