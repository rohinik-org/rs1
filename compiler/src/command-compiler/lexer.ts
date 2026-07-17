export type TokenType = 'verb' | 'noun' | 'condition' | 'conjunction' | 'qualifier' | 'filler'

export interface Token {
  readonly type: TokenType
  readonly value: string
  readonly raw: string
}

const VERB_WORDS = new Set([
  'install', 'add', 'get', 'setup', 'set', 'up',
  'uninstall', 'remove', 'delete',
  'list', 'show', 'display',
  'search', 'find',
  'inspect', 'details',
  'discover', 'scan', 'detect',
  'doctor', 'diagnose', 'check',
  'benchmark', 'test',
  'run', 'execute',
  'upgrade', 'update',
  'ask', 'version', 'info',
])

const CONJUNCTION_WORDS = new Set(['and', 'then', 'also', 'next', 'after'])
const CONDITION_WORDS = new Set(['if', 'unless', 'when', 'only'])
const FILLER_WORDS = new Set([
  'please', 'me', 'for', 'the', 'a', 'an', 'my', 'i', 'need', 'want',
  'could', 'you', 'would', 'can', 'what', 'is', 'are', 'was', 'were',
  'some', 'something', 'anything',
])

export class CommandLexer {
  tokenize(input: string): Token[] {
    const words = input.trim().toLowerCase().split(/\s+/)
    const tokens: Token[] = []
    for (const raw of words) {
      const value = raw.replace(/[.,!?]+$/, '')
      if (!value) continue
      if (VERB_WORDS.has(value)) {
        tokens.push({ type: 'verb', value, raw })
      } else if (CONJUNCTION_WORDS.has(value)) {
        tokens.push({ type: 'conjunction', value, raw })
      } else if (CONDITION_WORDS.has(value)) {
        tokens.push({ type: 'condition', value, raw })
      } else if (FILLER_WORDS.has(value)) {
        tokens.push({ type: 'filler', value, raw })
      } else {
        tokens.push({ type: 'noun', value, raw })
      }
    }
    return tokens
  }
}
