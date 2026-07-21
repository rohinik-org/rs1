import { createHash } from 'node:crypto'

export const KNOWLEDGE_IR_VERSION = 1

export type KnowledgePrimitive = 'Entity' | 'Concept' | 'Relationship' | 'Procedure' | 'Artifact'

export type EntityKind =
  | 'Tool'
  | 'Library'
  | 'Framework'
  | 'Database'
  | 'Language'
  | 'Package'
  | 'CloudService'
  | 'OS'
  | 'Capability'
  | 'Unknown'

export const KnowledgeRelationship = {
  CONTAINS:   'CONTAINS',
  USES:       'USES',
  DEPENDS_ON: 'DEPENDS_ON',
  PRODUCES:   'PRODUCES',
  IMPLEMENTS: 'IMPLEMENTS',
  CONFIGURES: 'CONFIGURES',
  GENERATES:  'GENERATES',
  EXECUTES:   'EXECUTES',
  REQUIRES:   'REQUIRES',
  OWNS:       'OWNS',
  REFERENCES: 'REFERENCES',
  IMPORTS:    'IMPORTS',
  EXPORTS:    'EXPORTS',
  CALLS:      'CALLS',
  READS:      'READS',
  WRITES:     'WRITES',
} as const

export type KnowledgeRelationship = (typeof KnowledgeRelationship)[keyof typeof KnowledgeRelationship]

export interface KnowledgeSource {
  readonly type: 'filesystem' | 'execution' | 'memory' | 'http' | 'user' | 'generated'
  readonly id: string
  readonly uri?: string
}

export interface Provenance {
  readonly observationIds: ReadonlyArray<string>
  readonly fragmentIds: ReadonlyArray<string>
  readonly workflowIds: ReadonlyArray<string>
  readonly extractorId?: string
}

export interface KnowledgeEvidence {
  readonly source: KnowledgeSource
  readonly observationCount: number
  readonly extractionMethod: string
}

export interface KnowledgeNode {
  readonly id: string
  readonly primitive: KnowledgePrimitive
  readonly kind?: EntityKind
  readonly label: string
  readonly source: KnowledgeSource
  readonly certainty: number
  readonly evidence: ReadonlyArray<KnowledgeEvidence>
  readonly provenance: Provenance
  readonly attributes: Readonly<Record<string, string>>
}

export interface KnowledgeEdge {
  readonly id: string
  readonly sourceNodeId: string
  readonly targetNodeId: string
  readonly relationship: KnowledgeRelationship
  readonly certainty: number
  readonly evidence: ReadonlyArray<KnowledgeEvidence>
  readonly provenance: Provenance
}

export interface ProcedureStep {
  readonly position: number
  readonly capabilityIds: ReadonlyArray<string>
  readonly inputTemplate: Readonly<Record<string, string>>
  readonly description: string
}

export interface ProcedureDefinition extends KnowledgeNode {
  readonly primitive: 'Procedure'
  readonly steps: ReadonlyArray<ProcedureStep>
  readonly requiredCapabilities: ReadonlyArray<string>
  readonly inputs: ReadonlyArray<{ name: string; type: string; required: boolean }>
  readonly outputs: ReadonlyArray<{ name: string; type: string }>
  readonly estimatedDurationMs?: number
  readonly sideEffects: ReadonlyArray<string>
}

export interface KnowledgeFragment {
  readonly schemaVersion: number
  readonly fragmentId: string
  readonly source: KnowledgeSource
  readonly provenance: Provenance
  readonly extractedAt: Date
  readonly nodes: ReadonlyArray<KnowledgeNode>
  readonly edges: ReadonlyArray<KnowledgeEdge>
  readonly procedures: ReadonlyArray<ProcedureDefinition>
}

export function contentId(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

export interface KnowledgeQuery {
  readonly primitive?: KnowledgePrimitive
  readonly kind?: EntityKind
  readonly label?: string
  readonly relationship?: KnowledgeRelationship
}

export interface KnowledgeQueryResult {
  readonly nodes: ReadonlyArray<KnowledgeNode>
  readonly edges: ReadonlyArray<KnowledgeEdge>
}

export interface ProcedureFilter {
  readonly requiredCapability?: string
  readonly sideEffect?: string
}

export interface EntityFilter {
  readonly kind?: EntityKind
  readonly label?: string
}
