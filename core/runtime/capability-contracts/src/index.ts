// @rohinik-org/capability-contracts
// Stage 9E-2 — Capability Consumption Contracts (implementation layer)

export { canonicalStringify, deserializeCanonicalJson } from './canonicalizer.js'
export { parseVersionRange } from './version.js'
export { createProductionIdGenerator, createProductionClock } from './production.js'
export { computeRequirementHash, computeSetHash } from './hash.js'
export { createCapabilityRequirementBuilder } from './builder.js'
export { createInMemoryCapabilityRequirementRepository } from './repository.js'

// Re-export IR types for consumer convenience.
export * from '@rohinik-org/capability-contracts-ir'
