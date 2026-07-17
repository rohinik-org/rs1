import type { LLMClient } from './intent-parser.js'
import { IntentParser } from './intent-parser.js'
import { EntityResolver } from './entity-resolver.js'
import { ConstraintResolver } from './constraint-resolver.js'
import { IntentValidator } from './intent-validator.js'
import type { CompilerContext } from '../types/compiler-context.js'
import type { IntentIR } from '../types/intent-ir.js'
import type { ClarificationIR } from '../types/clarification-ir.js'

export type CompilerResult =
  | { readonly ok: true; readonly intentIR: IntentIR }
  | { readonly ok: false; readonly clarification: ClarificationIR }

export class IntentCompiler {
  private readonly parser: IntentParser
  private readonly entityResolver = new EntityResolver()
  private readonly constraintResolver = new ConstraintResolver()
  private readonly validator = new IntentValidator()

  constructor(llm: LLMClient) {
    this.parser = new IntentParser(llm)
  }

  async compile(input: string, ctx: CompilerContext): Promise<CompilerResult> {
    const candidate = await this.parser.parse(input, ctx)
    const entityResult = this.entityResolver.resolve(candidate, ctx)
    if (!entityResult.ok) return { ok: false, clarification: entityResult.clarification }
    const constraints = this.constraintResolver.resolve(candidate)
    const validationResult = this.validator.validate(candidate, entityResult.entities, constraints, ctx)
    if (!validationResult.ok) return { ok: false, clarification: validationResult.clarification }
    return { ok: true, intentIR: validationResult.intentIR }
  }
}
