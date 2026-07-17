import { describe, it, expect } from 'vitest'
import { CapabilityPlanner } from '../synthesis/capability-planner.js'
import type { CapabilityGraphQuery } from '../synthesis/capability-graph-query.js'
import type { StructuredIntent } from '@rohinik-org/compiler'

function makeGraph(paths: Map<string, string[]>): CapabilityGraphQuery {
  return {
    reachable: async (from) => paths.get(from) ?? [],
    shortestPath: async (from, to) => {
      const neighbors = paths.get(from) ?? []
      return neighbors.includes(to) ? [from, to] : null
    },
    findNeighbors: async (node) => paths.get(node) ?? [],
    findAlternatives: async (node) => paths.get(node) ?? [],
  }
}

function makeIntent(concepts: string[], preferredSkills: string[] = []): StructuredIntent {
  return {
    intentId: 'test-intent',
    schemaVersion: '1.0',
    rawInput: 'test',
    concepts,
    preferredSkills,
    constraints: {},
    translatedBy: 'StaticIntentTranslator',
    translationConfidence: 1.0,
    unresolvedTerms: [],
  }
}

describe('CapabilityPlanner', () => {
  it('returns evidence with synthesized steps from graph paths', async () => {
    const graph = makeGraph(new Map([
      ['skill-read', ['skill-transform', 'skill-write']],
    ]))
    const planner = new CapabilityPlanner(graph)
    const evidence = await planner.synthesize(makeIntent(['read'], ['skill-read']))
    expect(evidence.length).toBeGreaterThan(0)
    expect(evidence[0]!.synthesizedSteps.length).toBeGreaterThan(0)
  })

  it('returns empty array when no preferred skills provided', async () => {
    const graph = makeGraph(new Map())
    const planner = new CapabilityPlanner(graph)
    const evidence = await planner.synthesize(makeIntent(['unknown']))
    expect(evidence).toEqual([])
  })

  it('includes graphPaths in evidence', async () => {
    const graph = makeGraph(new Map([['skill-a', ['skill-b']]]))
    const planner = new CapabilityPlanner(graph)
    const evidence = await planner.synthesize(makeIntent(['a', 'b'], ['skill-a']))
    expect(evidence[0]!.graphPaths.length).toBeGreaterThan(0)
  })
})
