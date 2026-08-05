import { describe, it, expect } from 'vitest'
import { ContextManager, ContextBuilder, ContextRanker, KnowledgeContributor, CapabilityContributor } from '../index.js'
import type { ContextContributor, MutableContext } from '../index.js'
import { DEFAULT_CONTEXT_POLICY } from '@rohinik-org/working-context'
import type { ContextRequest } from '@rohinik-org/working-context'
import type { KnowledgeFragment } from '@rohinik-org/knowledge'
import type { InstalledCapability } from '@rohinik-org/capability-registry'
import type { StructuredIntent } from '@rohinik-org/working-context'

const EMPTY_PROVENANCE = { observationIds: [], fragmentIds: [], workflowIds: [] }
const TEST_SOURCE = (id: string) => ({ type: 'memory' as const, id })

function makeIntent(concepts: string[] = [], skills: string[] = []): StructuredIntent {
  return {
    intentId: 'test-intent',
    schemaVersion: '1.0',
    rawInput: concepts.join(' '),
    concepts,
    preferredSkills: skills,
    constraints: {},
    translatedBy: 'test',
    translationConfidence: 0.9,
    unresolvedTerms: [],
  }
}

function makeFragment(label: string): KnowledgeFragment {
  return {
    schemaVersion: 1,
    fragmentId: `frag-${label}`,
    source: TEST_SOURCE(`test-${label}`),
    provenance: EMPTY_PROVENANCE,
    extractedAt: new Date(),
    nodes: [{
      id: `n-${label}`,
      primitive: 'Entity',
      kind: 'Tool',
      label,
      source: TEST_SOURCE(`test-${label}`),
      certainty: 1,
      evidence: [],
      provenance: EMPTY_PROVENANCE,
      attributes: {},
    }],
    edges: [],
    procedures: [],
  }
}

function makeCapability(id: string, tags: string[] = []): InstalledCapability {
  return {
    capabilityId: id,
    version: '1.0.0',
    manifest: { id, name: id, description: `${id} capability`, manifestVersion: 1, version: '1.0.0', inputs: [], outputs: [], tier: 'local', tags, driverRef: 'test' },
    installedAt: new Date(),
    source: { type: 'memory', id: 'test' },
    acquisitionId: 'test-acq',
    dependencies: [],
    state: 'REGISTERED',
  }
}

// ─── ContextRanker ────────────────────────────────────────────────────────────

describe('ContextRanker', () => {
  it('scores fragment by term overlap with node labels', () => {
    const ranker = new ContextRanker()
    const fragment = makeFragment('docker')
    const score = ranker.scoreFragment(fragment, ['docker', 'kubernetes'])
    expect(score).toBe(0.5)  // 1 of 2 terms matched
  })

  it('ranks fragments — highest overlap first', () => {
    const ranker = new ContextRanker()
    const f1 = makeFragment('docker')
    const f2 = makeFragment('python')
    const ranked = ranker.rankFragments([f2, f1], ['docker'])
    expect(ranked[0]!.fragmentId).toBe('frag-docker')
  })
})

// ─── ContextBuilder ───────────────────────────────────────────────────────────

describe('ContextBuilder', () => {
  it('assembles context with knowledge + capabilities when both present', () => {
    const builder = new ContextBuilder()
    const intent = makeIntent(['docker'], ['docker-tool'])
    const fragments = [makeFragment('docker'), makeFragment('python')]
    const caps = [makeCapability('docker-tool')]
    const ctx = builder.build(intent, DEFAULT_CONTEXT_POLICY, fragments, caps)
    expect(ctx.knowledgeFragments.length).toBeGreaterThan(0)
    expect(ctx.installedCapabilities.length).toBeGreaterThan(0)
    expect(ctx.contributors).toContain('knowledge')
    expect(ctx.contributors).toContain('capabilities')
  })

  it('assembles gracefully with no contributors', () => {
    const builder = new ContextBuilder()
    const intent = makeIntent(['xyz'])
    const ctx = builder.build(intent, DEFAULT_CONTEXT_POLICY, [], [])
    expect(ctx.knowledgeFragments).toHaveLength(0)
    expect(ctx.installedCapabilities).toHaveLength(0)
    expect(ctx.contributors).toHaveLength(0)
  })

  it('assembles with knowledge only — capabilities excluded by policy', () => {
    const builder = new ContextBuilder()
    const intent = makeIntent(['docker'])
    const policy = { ...DEFAULT_CONTEXT_POLICY, includeCapabilities: false }
    const ctx = builder.build(intent, policy, [makeFragment('docker')], [makeCapability('cap')])
    expect(ctx.installedCapabilities).toHaveLength(0)
    expect(ctx.contributors).toContain('knowledge')
    expect(ctx.contributors).not.toContain('capabilities')
  })
})

// ─── WorkingContextIR immutability ───────────────────────────────────────────

describe('WorkingContextIR', () => {
  it('is frozen (Law 29)', () => {
    const builder = new ContextBuilder()
    const ctx = builder.build(makeIntent(['test']), DEFAULT_CONTEXT_POLICY, [], [])
    expect(Object.isFrozen(ctx)).toBe(true)
  })

  it('contextId is deterministic for same inputs', () => {
    const builder = new ContextBuilder()
    const intent = makeIntent(['docker'])
    const fragments = [makeFragment('docker')]
    const ctx1 = builder.build(intent, DEFAULT_CONTEXT_POLICY, fragments, [])
    const ctx2 = builder.build(intent, DEFAULT_CONTEXT_POLICY, fragments, [])
    expect(ctx1.contextId).toBe(ctx2.contextId)
  })
})

// ─── Budget enforcement ───────────────────────────────────────────────────────

describe('ContextPolicy budget', () => {
  it('truncates knowledgeFragments to maxKnowledgeFragments', () => {
    const builder = new ContextBuilder()
    const policy = { ...DEFAULT_CONTEXT_POLICY, budget: { ...DEFAULT_CONTEXT_POLICY.budget, maxKnowledgeFragments: 2 } }
    const fragments = ['a', 'b', 'c', 'd'].map(makeFragment)
    const ctx = builder.build(makeIntent(['a', 'b', 'c']), policy, fragments, [])
    expect(ctx.knowledgeFragments.length).toBeLessThanOrEqual(2)
  })

  it('truncates installedCapabilities to maxCapabilities', () => {
    const builder = new ContextBuilder()
    const policy = { ...DEFAULT_CONTEXT_POLICY, budget: { ...DEFAULT_CONTEXT_POLICY.budget, maxCapabilities: 1 } }
    const caps = ['a', 'b', 'c'].map(id => makeCapability(id, [id]))
    const ctx = builder.build(makeIntent(['a', 'b']), policy, [], caps)
    expect(ctx.installedCapabilities.length).toBeLessThanOrEqual(1)
  })
})

// ─── ContextManager ───────────────────────────────────────────────────────────

describe('ContextManager', () => {
  it('builds empty context with no contributors registered', async () => {
    const mgr = new ContextManager()
    const ctx = await mgr.build(makeIntent(['docker']))
    expect(ctx.knowledgeFragments).toHaveLength(0)
    expect(ctx.installedCapabilities).toHaveLength(0)
  })

  it('builds context with knowledge contributor', async () => {
    const mgr = new ContextManager()
    const reg = { list: () => [makeFragment('docker')] }
    mgr.withKnowledge(reg)
    const ctx = await mgr.build(makeIntent(['docker']))
    expect(ctx.knowledgeFragments).toHaveLength(1)
  })

  it('is JSON-serializable (Law 35)', async () => {
    const mgr = new ContextManager()
    const ctx = await mgr.build(makeIntent(['test']))
    const json = JSON.stringify(ctx)
    const parsed = JSON.parse(json)
    expect(parsed.contextId).toBe(ctx.contextId)
    expect(parsed.contributors).toBeDefined()
  })
})

// ─── ContextContributor ───────────────────────────────────────────────────────

describe('ContextContributor', () => {
  it('custom contributor is called and its id appears in contributors', async () => {
    const mgr = new ContextManager()
    const custom: ContextContributor = {
      contributorId: 'custom',
      priority: 5,
      async contribute(_req: ContextRequest, ctx: MutableContext) {
        ctx.knowledgeFragments.push(makeFragment('custom-node'))
      },
    }
    mgr.withContributor(custom)
    const ctx = await mgr.build(makeIntent(['custom-node']))
    expect(ctx.knowledgeFragments).toHaveLength(1)
    expect(ctx.contributors).toContain('knowledge')
  })

  it('contributors run in priority order', async () => {
    const order: number[] = []
    const mgr = new ContextManager()
    const c1: ContextContributor = { contributorId: 'c1', priority: 20, async contribute() { order.push(20) } }
    const c2: ContextContributor = { contributorId: 'c2', priority: 5,  async contribute() { order.push(5) } }
    mgr.withContributor(c1).withContributor(c2)
    await mgr.build(makeIntent([]))
    expect(order).toEqual([5, 20])
  })

  it('KnowledgeContributor feeds fragments', async () => {
    const mgr = new ContextManager()
    mgr.withContributor(new KnowledgeContributor({ list: () => [makeFragment('docker')] }))
    const ctx = await mgr.build(makeIntent(['docker']))
    expect(ctx.knowledgeFragments).toHaveLength(1)
  })
})

// ─── ContextRequest ───────────────────────────────────────────────────────────

describe('ContextRequest', () => {
  it('build accepts ContextRequest directly', async () => {
    const mgr = new ContextManager()
    const req: ContextRequest = {
      requestId: 'explicit-req',
      intent: makeIntent(['docker']),
      policy: DEFAULT_CONTEXT_POLICY,
    }
    const ctx = await mgr.build(req)
    expect(ctx.contextId).toBeDefined()
  })

  it('build(intent, policy) and build(ContextRequest) produce same contextId', async () => {
    const intent = makeIntent(['docker'])
    const mgr1 = new ContextManager()
    const mgr2 = new ContextManager()
    const ctx1 = await mgr1.build(intent, DEFAULT_CONTEXT_POLICY)
    const ctx2 = await mgr2.build({ requestId: 'r2', intent, policy: DEFAULT_CONTEXT_POLICY })
    expect(ctx1.contextId).toBe(ctx2.contextId)
  })
})
