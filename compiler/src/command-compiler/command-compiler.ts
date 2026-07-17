import { randomUUID } from 'node:crypto'
import { CommandLexer } from './lexer.js'
import { CommandParser } from './parser.js'
import { OntologyResolver } from './resolvers/ontology-resolver.js'
import { CatalogResolver } from './resolvers/catalog-resolver.js'
import { HostResolver } from './resolvers/host-resolver.js'
import { PackageManagerResolver } from './resolvers/package-manager-resolver.js'
import { LlmResolver } from './resolvers/llm-resolver.js'
import type { CommandIR, CommandCondition, CommandResolution } from '../types/command-ir.js'
import type { CommandAST } from './parser.js'

const READ_ONLY_ACTIONS = new Set(['list', 'search', 'inspect', 'doctor', 'discover', 'version', 'info', 'benchmark', 'demo'])

export class CommandCompiler {
  private readonly lexer = new CommandLexer()
  private readonly parser = new CommandParser()
  private readonly ontologyResolver = new OntologyResolver()
  private readonly catalogResolver: CatalogResolver
  private readonly hostResolver: HostResolver
  private readonly packageManagerResolver = new PackageManagerResolver()
  private readonly llmResolver = new LlmResolver()

  constructor(private readonly projectRoot: string) {
    this.catalogResolver = new CatalogResolver(projectRoot)
    this.hostResolver = new HostResolver(projectRoot)
  }

  async compile(rawInput: string): Promise<readonly CommandIR[]> {
    const tokens = this.lexer.tokenize(rawInput)
    const ast = this.parser.parse(tokens)
    const primary = await this.compileAST(ast, rawInput)
    return [primary]
  }

  private async compileAST(ast: CommandAST, rawInput: string): Promise<CommandIR> {
    const ontologyResult = this.ontologyResolver.resolve(ast, rawInput)
    let action = ontologyResult.action
    let target = ontologyResult.target
    let confidence = ontologyResult.confidence
    let resolution: CommandResolution = ontologyResult.resolution

    let conditions: readonly CommandCondition[] = []
    let confirmation: CommandIR['confirmation'] = READ_ONLY_ACTIONS.has(action) ? 'NONE' : 'REQUIRED'

    if (target !== undefined && (action === 'install' || action === 'inspect')) {
      const catalogResult = await this.catalogResolver.resolve(target)
      if (catalogResult) {
        resolution = catalogResult
        if (action === 'install') action = 'inspect'
        confirmation = 'NONE'
        confidence = Math.max(confidence, 0.95)
      } else if (action === 'install') {
        const hostResult = await this.hostResolver.resolve(target)
        if (hostResult) {
          resolution = hostResult.resolution
          conditions = hostResult.conditions
          confirmation = hostResult.confirmation
          confidence = Math.max(confidence, 0.9)
        } else {
          const pmResult = this.packageManagerResolver.resolve(target)
          if (pmResult) {
            resolution = pmResult
            confidence = Math.max(confidence, 0.85)
          } else if (confidence < 0.7) {
            const llmResult = await this.llmResolver.resolve(rawInput)
            action = llmResult.action
            if (llmResult.target !== undefined) target = llmResult.target
            resolution = llmResult.resolution
            confidence = llmResult.confidence
          }
        }
      }
    }

    const sequence = await Promise.all(
      ast.sequence.map(subAst => this.compileAST(subAst, subAst.rawTokens.join(' ')))
    )

    return {
      kind: 'CommandIR',
      schemaVersion: '1.0',
      commandId: randomUUID(),
      action,
      ...(target !== undefined ? { target } : {}),
      conditions,
      options: {},
      confirmation,
      sequence,
      confidence,
      origin: 'natural-language',
      rawInput,
      resolution,
    }
  }
}
