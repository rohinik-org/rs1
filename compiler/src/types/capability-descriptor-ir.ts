import type { RuntimeArtifactBase } from './artifact.js'

// Typed identifier for normalized Rohinik semantic capabilities.
// Not a raw string — enables ontology, versioning, deprecation.
// Examples: 'filesystem.read', 'user.create', 'research.execute'
export type SemanticCapabilityID = string

export interface DescriptorOrigin {
  readonly protocol: string
  readonly adapterId: string
  readonly adapterVersion: string
  readonly protocolVersion: string
  readonly endpoint?: string
  readonly discoveryHash: string
  readonly capturedAt: string
}

// Protocol-neutral capability description. Not "ToolDescriptor" because
// not all protocols expose "tools" — some expose services, endpoints,
// graphs, workflows, agents, or commands.
export interface CapabilityDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly examples?: readonly string[]
  readonly inputSchema?: unknown
  readonly outputSchema?: unknown
  readonly tags?: readonly string[]
  readonly estimatedLatency?: 'very-low' | 'low' | 'medium' | 'high'
  readonly estimatedCost?: 'free' | 'low' | 'medium' | 'high'
  readonly sideEffects?: readonly string[]
  readonly idempotent?: boolean
}

// First Rohinik-native artifact produced by any adapter frontend.
// No matchers, no tiers, no SDK types — pure semantic description.
export interface CapabilityDescriptorIR extends RuntimeArtifactBase {
  // meta.kind = 'CapabilityDescriptorIR'
  // meta.artifactId = SHA-256 of body
  readonly origin: DescriptorOrigin
  readonly capabilities: readonly CapabilityDefinition[]
}
