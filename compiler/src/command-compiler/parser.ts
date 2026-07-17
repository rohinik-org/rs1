import type { Token } from './lexer.js'

export interface CommandAST {
  readonly verb: string
  readonly object?: string
  readonly conditions: readonly string[]
  readonly qualifiers: readonly string[]
  readonly sequence: readonly CommandAST[]
  readonly rawTokens: readonly string[]
}

export class CommandParser {
  parse(tokens: Token[]): CommandAST {
    const segments = this.splitOnConjunctions(tokens)
    const first = segments[0]
    if (!first || first.length === 0) {
      return { verb: '', conditions: [], qualifiers: [], sequence: [], rawTokens: [] }
    }
    const primary = this.parseSegment(first)
    const sequence = segments.slice(1).map(seg => this.parseSegment(seg))
    return { ...primary, sequence }
  }

  private splitOnConjunctions(tokens: Token[]): Token[][] {
    const segments: Token[][] = []
    let current: Token[] = []
    for (const token of tokens) {
      if (token.type === 'conjunction') {
        if (current.length > 0) segments.push(current)
        current = []
      } else {
        current.push(token)
      }
    }
    if (current.length > 0) segments.push(current)
    return segments
  }

  private parseSegment(tokens: Token[]): CommandAST {
    const meaningful = tokens.filter(t => t.type !== 'filler')
    const verbs = meaningful.filter(t => t.type === 'verb')
    const nouns = meaningful.filter(t => t.type === 'noun')
    const conditions = meaningful.filter(t => t.type === 'condition').map(t => t.value)
    const verb = verbs[0]?.value ?? ''
    const object = nouns[0]?.value
    return {
      verb,
      ...(object !== undefined ? { object } : {}),
      conditions,
      qualifiers: [],
      sequence: [],
      rawTokens: tokens.map(t => t.raw),
    }
  }
}
