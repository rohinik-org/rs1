import { CommandOntology } from '../ontology.js'
import type { CommandAST } from '../parser.js'
import type { CommandResolution } from '../../types/command-ir.js'

export interface PartialCommandIR {
  action: string
  target?: string
  subAction?: string
  confidence: number
  resolution: CommandResolution
}

export class OntologyResolver {
  resolve(ast: CommandAST, rawInput: string): PartialCommandIR {
    const action = CommandOntology.resolveVerb(ast.verb)
    if (!action) {
      return {
        action: ast.verb,
        confidence: 0.1,
        resolution: { source: 'ontology', explanation: `Unknown verb: "${ast.verb}"` },
      }
    }
    const targetResolution = ast.object ? CommandOntology.resolveTarget(ast.object) : null
    const target = targetResolution?.id ?? ast.object
    const confidence = ast.object
      ? targetResolution ? 0.95 : 0.7
      : CommandOntology.isKnownVerb(ast.verb) ? 0.9 : 0.5
    return {
      action,
      ...(target !== undefined ? { target } : {}),
      confidence,
      resolution: {
        source: 'ontology',
        explanation: targetResolution
          ? `Resolved "${ast.verb}" → ${action}, "${ast.object}" → ${target} (${targetResolution.type})`
          : `Resolved "${ast.verb}" → ${action}`,
      },
    }
  }
}
