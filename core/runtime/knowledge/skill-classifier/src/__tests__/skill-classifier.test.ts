import { describe, it, expect } from 'vitest'
import { SkillClassifier } from '../index.js'
import {
  KNOWLEDGE_IR_VERSION,
  type KnowledgeFragment,
  type ProcedureDefinition,
  type KnowledgeSource,
  type Provenance,
  type KnowledgeEvidence,
} from '@rohinik-org/knowledge'
import { createHash } from 'node:crypto'

function id(obj: unknown) { return createHash('sha256').update(JSON.stringify(obj)).digest('hex') }
function prov(): Provenance { return { observationIds: [], fragmentIds: [], workflowIds: [], extractorId: 'test' } }
function ev(src: KnowledgeSource): KnowledgeEvidence { return { source: src, observationCount: 1, extractionMethod: 'test' } }

function makeProc(label: string): ProcedureDefinition {
  const src: KnowledgeSource = { type: 'filesystem', id: 'test.json' }
  return {
    id: id({ label }),
    primitive: 'Procedure',
    label,
    source: src,
    certainty: 1.0,
    evidence: [ev(src)],
    provenance: prov(),
    attributes: {},
    steps: [{ position: 0, capabilityIds: ['local-shell:execute'], inputTemplate: { command: label }, description: label }],
    requiredCapabilities: ['local-shell:execute'],
    inputs: [],
    outputs: [],
    sideEffects: ['shell:execute'],
  }
}

function makeFragment(procs: ProcedureDefinition[]): KnowledgeFragment {
  const src: KnowledgeSource = { type: 'filesystem', id: 'test.json' }
  return {
    schemaVersion: KNOWLEDGE_IR_VERSION,
    fragmentId: id({ procs }),
    source: src,
    provenance: prov(),
    extractedAt: new Date(),
    nodes: [],
    edges: [],
    procedures: procs,
  }
}

describe('SkillClassifier', () => {
  const cls = new SkillClassifier()

  it('classify returns candidate per procedure', () => {
    const f = makeFragment([makeProc('build'), makeProc('test')])
    expect(cls.classify(f).length).toBe(2)
  })

  it('candidate has stable capabilityId', () => {
    const f = makeFragment([makeProc('build')])
    const [c] = cls.classify(f)
    expect(c.capabilityId).toMatch(/^procedure:/)
  })

  it('classify returns empty for fragment with no procedures', () => {
    const f = makeFragment([])
    expect(cls.classify(f)).toHaveLength(0)
  })

  it('promote produces CapabilityDescriptorIR with driverRef=knowledge', () => {
    const f = makeFragment([makeProc('deploy')])
    const [c] = cls.classify(f)
    const ir = cls.promote(c)
    expect(ir.driverRef).toBe('knowledge')
    expect(ir.id).toBe(c.capabilityId)
  })
})
