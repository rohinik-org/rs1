export type CapabilityGraphNodeKind =
  | 'CAPABILITY'       // CapabilityDescriptorIR entry
  | 'HOST_RESOURCE'    // HostResource (python, docker, git)
  | 'PROVIDER'         // Anthropic, OpenAI, Ollama
  | 'SEMANTIC_ASSET'   // Claude Skill, Cursor Rule
  | 'PACK'             // @rohinik-org/starter-pack
  | 'CONCEPT'          // ontology concept — uses concept:// IDs
  | 'WORKFLOW'         // multi-step execution sequence — Phase 6+
  | 'EXECUTION'        // link to ExecutionRecord — Phase 6+
  | 'FEDERATION_NODE'  // remote Rohinik node — Phase 8

export interface CapabilityGraphNode {
  readonly nodeId: string               // rohinik://graph/<kind>/<name> or concept://<name>
  readonly nodeKind: CapabilityGraphNodeKind
  readonly name: string
  readonly displayName: string          // locale display; use name for logic
  readonly version?: string
  readonly sourceId?: string            // links to catalog/host-inventory entry
  readonly tags: readonly string[]
  readonly metadata: Record<string, unknown>
  readonly addedAt: string              // ISO-8601
}

export type CapabilityGraphRelationship =
  | 'DEPENDS_ON'        // hard dependency
  | 'REQUIRES_HOST'     // needs host binary/runtime
  | 'PROVIDES_RUNTIME'  // offers execution environment
  | 'USES_PROVIDER'     // executes via AI/LLM provider
  | 'IMPLEMENTS'        // provides implementation of a concept
  | 'PRODUCES'          // outputs a data type (→ concept node)
  | 'CONSUMES'          // takes data type as input (→ concept node)
  | 'ALTERNATIVE_TO'    // functionally equivalent (symmetric)
  | 'RECOMMENDS'        // soft suggestion, not required
  | 'GENERATED_FROM'    // compiled/derived from artifact
  | 'COMPILES_TO'       // produces IR or artifact type
  | 'INSTALLED_BY'      // installed via specific mechanism
  | 'EXTENDS'           // adds functionality to another node
  | 'CONFLICTS_WITH'    // incompatible (symmetric)
  | 'SUPERSEDES'        // replaces older version/node
  | 'RECOMMENDS_WORKFLOW' // capability recommends a workflow — Phase 6

// DECLARED and OBSERVED always have confidence 1.0.
// INFERRED carries variable confidence — Stage 5+ only.
export type EdgeCertainty = 'DECLARED' | 'OBSERVED' | 'INFERRED'

export type EdgeProvenance =
  | 'capability-compiler'
  | 'semantic-compiler'
  | 'host-discovery'
  | 'package-manifest'
  | 'ontology'
  | 'execution-corpus'   // Stage 5+
  | 'user-declared'

export interface CapabilityGraphEdge {
  readonly edgeId: string
  readonly source: string               // nodeId
  readonly target: string               // nodeId
  readonly relationship: CapabilityGraphRelationship
  readonly certainty: EdgeCertainty
  readonly confidence: number           // 0–1 (always 1.0 for DECLARED/OBSERVED)
  readonly required: boolean
  readonly provenance: EdgeProvenance
  readonly provenanceDetail?: string
  // Populated only for INFERRED edges (certainty === 'INFERRED')
  readonly originInferenceId?: string              // InferenceSet.inferenceSetId
  readonly originRule?: string                     // InferenceCandidate.inferenceRuleId
  readonly evidenceSampleSize?: number             // InferenceEvidence.executions
  readonly evidenceCount?: number                  // InferenceEvidence.successes
  readonly addedAt: string              // ISO-8601
}

// CapabilityGraph: first-class Rohinik artifact.
// Always derived from canonical artifacts — never authored directly.
// Stored at .rohinik/capability-graph.json
export interface CapabilityGraph {
  readonly kind: 'CapabilityGraph'
  readonly schemaVersion: '1.0'
  readonly graphId: string              // SHA-256 of canonical content
  readonly revision: number             // increments on every write
  readonly capturedAt: string
  readonly lastUpdatedAt: string
  readonly nodes: readonly CapabilityGraphNode[]
  readonly edges: readonly CapabilityGraphEdge[]
  readonly nodeCount: number
  readonly edgeCount: number
}
