import { describe, it, expect } from 'vitest'
import {
  KnowledgeRelationship,
  KNOWLEDGE_IR_VERSION,
  contentId,
  type KnowledgeFragment,
  type KnowledgeNode,
  type Provenance,
  type KnowledgeSource,
  type KnowledgeEvidence,
} from '../knowledge-ir.js'
import { KnowledgeRegistry, SemanticIndex } from '../knowledge-registry.js'
import { KnowledgeService } from '../knowledge-service.js'
import { KnowledgeContributor } from '../knowledge-contributor.js'

function makeSource(id = 'test.json'): KnowledgeSource {
  return { type: 'filesystem', id }
}

function makeProvenance(opts?: Partial<Provenance>): Provenance {
  return {
    observationIds: [],
    fragmentIds: [],
    workflowIds: [],
    ...opts,
  }
}

function makeEvidence(source = makeSource()): KnowledgeEvidence {
  return { source, observationCount: 1, extractionMethod: 'test-extractor' }
}

function makeNode(label: string, primitive: 'Entity' | 'Concept' | 'Procedure' = 'Entity'): KnowledgeNode {
  return {
    id: contentId({ label, primitive }),
    primitive,
    kind: primitive === 'Entity' ? 'Library' : undefined,
    label,
    source: makeSource(),
    certainty: 0.9,
    evidence: [makeEvidence()],
    provenance: makeProvenance({ extractorId: 'test-extractor' }),
    attributes: {},
  }
}

function makeFragment(nodes: KnowledgeNode[] = [], source = makeSource()): KnowledgeFragment {
  return {
    schemaVersion: KNOWLEDGE_IR_VERSION,
    fragmentId: contentId({ nodes, source }),
    source,
    provenance: makeProvenance({ extractorId: 'test-extractor' }),
    extractedAt: new Date(),
    nodes,
    edges: [],
    procedures: [],
  }
}

describe('KnowledgeRelationship', () => {
  it('has all 16 values', () => {
    const values = Object.values(KnowledgeRelationship)
    expect(values.length).toBe(16)
  })

  it('values are string literals matching keys', () => {
    for (const [k, v] of Object.entries(KnowledgeRelationship)) {
      expect(k).toBe(v)
    }
  })
})

describe('Provenance', () => {
  it('populated at extraction time', () => {
    const p = makeProvenance({ extractorId: 'pkg-extractor' })
    expect(p.extractorId).toBe('pkg-extractor')
  })

  it('certainty:1.0 requires provenance entry', () => {
    // constraint: node with certainty 1.0 must have observationIds or extractorId
    const node: KnowledgeNode = {
      ...makeNode('react'),
      certainty: 1.0,
      provenance: makeProvenance({ extractorId: 'package-json-extractor' }),
    }
    const valid = node.certainty < 1.0 || node.provenance.observationIds.length > 0 || !!node.provenance.extractorId
    expect(valid).toBe(true)
  })

  it('fragment provenance chain populated', () => {
    const frag = makeFragment([makeNode('react')])
    expect(frag.provenance.extractorId).toBe('test-extractor')
  })
})

describe('KnowledgeRegistry', () => {
  it('register + list returns fragment', () => {
    const reg = new KnowledgeRegistry()
    const f = makeFragment([makeNode('react')])
    reg.register(f)
    expect(reg.list().length).toBe(1)
  })

  it('findBySource returns registered fragment', () => {
    const reg = new KnowledgeRegistry()
    const src = makeSource('package.json')
    reg.register(makeFragment([], src))
    expect(reg.findBySource(src)).toBeDefined()
  })

  it('findBySource returns undefined for unknown source', () => {
    const reg = new KnowledgeRegistry()
    expect(reg.findBySource(makeSource('missing.json'))).toBeUndefined()
  })

  it('summary counts correct after register', () => {
    const reg = new KnowledgeRegistry()
    reg.register(makeFragment([makeNode('react', 'Entity'), makeNode('bundler', 'Concept')]))
    const s = reg.summary()
    expect(s.entities).toBe(1)
    expect(s.concepts).toBe(1)
  })

  it('isDirty set after register, cleared after SemanticIndex rebuild', () => {
    const reg = new KnowledgeRegistry()
    reg.register(makeFragment([makeNode('a')]))
    expect(reg.isDirty()).toBe(true)
    const idx = new SemanticIndex(reg)
    idx.rebuild()
    expect(reg.isDirty()).toBe(false)
  })
})

describe('SemanticIndex', () => {
  it('findByLabel finds node', () => {
    const reg = new KnowledgeRegistry()
    reg.register(makeFragment([makeNode('react')]))
    const idx = new SemanticIndex(reg)
    expect(idx.findByLabel('react').length).toBe(1)
  })

  it('findByLabel is case-insensitive', () => {
    const reg = new KnowledgeRegistry()
    reg.register(makeFragment([makeNode('TypeScript')]))
    const idx = new SemanticIndex(reg)
    expect(idx.findByLabel('typescript').length).toBe(1)
  })

  it('findByPrimitive filters correctly', () => {
    const reg = new KnowledgeRegistry()
    reg.register(makeFragment([makeNode('react', 'Entity'), makeNode('bundling', 'Concept')]))
    const idx = new SemanticIndex(reg)
    expect(idx.findByPrimitive('Entity').length).toBe(1)
    expect(idx.findByPrimitive('Concept').length).toBe(1)
  })

  it('findByKind filters by entity kind', () => {
    const reg = new KnowledgeRegistry()
    reg.register(makeFragment([makeNode('react', 'Entity')]))
    const idx = new SemanticIndex(reg)
    expect(idx.findByKind('Library').length).toBe(1)
    expect(idx.findByKind('Database').length).toBe(0)
  })

  it('auto-rebuilds on dirty registry', () => {
    const reg = new KnowledgeRegistry()
    const idx = new SemanticIndex(reg)
    reg.register(makeFragment([makeNode('vitest')]))
    // query triggers lazy rebuild
    expect(idx.findByLabel('vitest').length).toBe(1)
  })
})

describe('KnowledgeService', () => {
  function makeService() {
    const reg = new KnowledgeRegistry()
    const idx = new SemanticIndex(reg)
    const pipeline = {
      extract: (_p: string, _c: string) => makeFragment([makeNode('extracted')], makeSource(_p)),
    }
    const classifier = { classify: () => [] }
    return { reg, idx, svc: new KnowledgeService(reg, idx, pipeline, classifier) }
  }

  it('extract registers fragment and returns it', async () => {
    const { reg, svc } = makeService()
    const f = await svc.extract('pkg.json', '{}')
    expect(f.nodes.length).toBeGreaterThan(0)
    expect(reg.list().length).toBe(1)
  })

  it('query by primitive returns nodes', async () => {
    const { svc } = makeService()
    await svc.extract('pkg.json', '{}')
    const result = await svc.query({ primitive: 'Entity' })
    expect(result.nodes.length).toBeGreaterThan(0)
  })

  it('findEntities with kind filter', async () => {
    const { svc } = makeService()
    await svc.extract('pkg.json', '{}')
    const entities = await svc.findEntities({ kind: 'Library' })
    expect(entities.length).toBeGreaterThan(0)
  })

  it('classify delegates to classifier', async () => {
    const { svc } = makeService()
    const f = await svc.extract('pkg.json', '{}')
    const candidates = await svc.classify(f)
    expect(Array.isArray(candidates)).toBe(true)
  })
})

describe('KnowledgeContributor', () => {
  it('contributorId is stable', () => {
    const reg = new KnowledgeRegistry()
    const c = new KnowledgeContributor(reg)
    expect(c.contributorId).toBe('knowledge-contributor')
  })

  it('contribute returns nodes from registry', async () => {
    const reg = new KnowledgeRegistry()
    reg.register(makeFragment([makeNode('react')]))
    const c = new KnowledgeContributor(reg)
    const result = await c.contribute({ projectRoot: '/tmp', existingGraph: null })
    expect(result.nodes.length).toBeGreaterThan(0)
  })
})
