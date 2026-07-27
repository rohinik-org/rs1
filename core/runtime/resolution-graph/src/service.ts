import type { CapabilityResolutionService, ProposedCapabilityResolutionPlan } from '@rohinik-org/resolution-graph-ir'
import { buildGraph } from './graph-builder.js'
import { solve } from './solver.js'

export function createCapabilityResolutionService(): CapabilityResolutionService {
  return {
    buildGraph,
    solve,
    serialize: (plan: ProposedCapabilityResolutionPlan) => JSON.stringify(plan, null, 2),
  }
}
