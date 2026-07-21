import type {
  KnowledgeFragment,
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeSource,
  KnowledgePrimitive,
  EntityKind,
  ProcedureDefinition,
  ProcedureFilter,
  EntityFilter,
} from './knowledge-ir.js'

export class KnowledgeRegistry {
  private readonly _fragments: KnowledgeFragment[] = []
  private readonly _bySource = new Map<string, KnowledgeFragment>()
  // ponytail: dirty flag notifies SemanticIndex lazily; avoids eager rebuild on every register
  private _dirty = false

  register(fragment: KnowledgeFragment): void {
    const key = `${fragment.source.type}:${fragment.source.id}`
    this._fragments.push(fragment)
    this._bySource.set(key, fragment)
    this._dirty = true
  }

  findBySource(source: KnowledgeSource): KnowledgeFragment | undefined {
    return this._bySource.get(`${source.type}:${source.id}`)
  }

  list(): ReadonlyArray<KnowledgeFragment> {
    return this._fragments
  }

  summary(): { entities: number; concepts: number; procedures: number; relationships: number; artifacts: number } {
    let entities = 0, concepts = 0, procedures = 0, relationships = 0, artifacts = 0
    for (const f of this._fragments) {
      for (const n of f.nodes) {
        if (n.primitive === 'Entity') entities++
        else if (n.primitive === 'Concept') concepts++
        else if (n.primitive === 'Relationship') relationships++
        else if (n.primitive === 'Artifact') artifacts++
      }
      procedures += f.procedures.length
    }
    return { entities, concepts, procedures, relationships, artifacts }
  }

  isDirty(): boolean { return this._dirty }
  clearDirty(): void { this._dirty = false }

  allNodes(): ReadonlyArray<KnowledgeNode> {
    return this._fragments.flatMap(f => [...f.nodes, ...f.procedures])
  }

  allEdges(): ReadonlyArray<KnowledgeEdge> {
    return this._fragments.flatMap(f => f.edges)
  }
}

export class SemanticIndex {
  private _nodes: KnowledgeNode[] = []

  constructor(private readonly registry: KnowledgeRegistry) {}

  rebuild(): void {
    this._nodes = [...this.registry.allNodes()]
    this.registry.clearDirty()
  }

  private ensureFresh(): void {
    if (this.registry.isDirty()) this.rebuild()
  }

  findByLabel(label: string): KnowledgeNode[] {
    this.ensureFresh()
    const lower = label.toLowerCase()
    return this._nodes.filter(n => n.label.toLowerCase().includes(lower))
  }

  findByPrimitive(primitive: KnowledgePrimitive): KnowledgeNode[] {
    this.ensureFresh()
    return this._nodes.filter(n => n.primitive === primitive)
  }

  findByKind(kind: EntityKind): KnowledgeNode[] {
    this.ensureFresh()
    return this._nodes.filter(n => n.kind === kind)
  }

  findProcedures(filter?: ProcedureFilter): ProcedureDefinition[] {
    this.ensureFresh()
    return this._nodes.filter((n): n is ProcedureDefinition => {
      if (n.primitive !== 'Procedure') return false
      const p = n as ProcedureDefinition
      if (filter?.requiredCapability && !p.requiredCapabilities.includes(filter.requiredCapability)) return false
      if (filter?.sideEffect && !p.sideEffects.includes(filter.sideEffect)) return false
      return true
    })
  }

  findEntities(filter?: EntityFilter): KnowledgeNode[] {
    this.ensureFresh()
    return this._nodes.filter(n => {
      if (n.primitive !== 'Entity') return false
      if (filter?.kind && n.kind !== filter.kind) return false
      if (filter?.label && !n.label.toLowerCase().includes(filter.label.toLowerCase())) return false
      return true
    })
  }
}
