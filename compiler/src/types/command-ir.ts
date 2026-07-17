export type CommandCondition =
  | 'IF_NOT_PRESENT'       // install only if missing from host
  | 'IF_NOT_REGISTERED'    // install/register only if not in catalog
  | 'IF_OUTDATED'          // upgrade only if version is stale
  | 'IF_HEALTHY'           // execute only if health check passes
  | 'UNLESS_REGISTERED'    // skip if already in catalog

export interface CommandResolution {
  readonly source:
    | 'catalog'          // found in .rohinik/catalog.json
    | 'host'             // found in .rohinik/host-inventory.json
    | 'package-manager'  // requires platform package manager
    | 'semantic-pack'    // maps to an Rohinik semantic pack
    | 'ontology'         // resolved via static ontology, no runtime check
    | 'llm'              // resolved via LLM fallback
    | 'manual'           // user-specified (e.g. --frontend flag)
  readonly resolvedId?: string
  readonly explanation: string
}

// Canonical artifact produced by the Command Compiler.
// Ephemeral — not persisted. Typed and versioned.
// Every interface (NL, CLI, REST, Voice) produces the same CommandIR.
export interface CommandIR {
  readonly kind: 'CommandIR'
  readonly schemaVersion: '1.0'
  readonly commandId: string
  readonly action: string
  readonly target?: string
  readonly subAction?: string
  readonly conditions: readonly CommandCondition[]
  readonly options: Readonly<Record<string, unknown>>
  readonly confirmation: 'REQUIRED' | 'OPTIONAL' | 'NONE'
  readonly sequence: readonly CommandIR[]
  readonly confidence: number              // 0–1
  readonly origin: 'natural-language' | 'cli' | 'rest' | 'sdk' | 'voice'
  readonly rawInput: string
  readonly resolution: CommandResolution
}
