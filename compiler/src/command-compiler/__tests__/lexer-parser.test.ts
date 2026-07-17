import { describe, it, expect } from 'vitest'
import { CommandLexer } from '../lexer.js'
import { CommandParser } from '../parser.js'

describe('CommandLexer', () => {
  it('tokenizes a simple install command', () => {
    const lexer = new CommandLexer()
    const tokens = lexer.tokenize('Install Python')
    expect(tokens.some(t => t.type === 'verb' && t.value === 'install')).toBe(true)
    expect(tokens.some(t => t.type === 'noun' && t.value === 'python')).toBe(true)
  })

  it('tokenizes a list command', () => {
    const lexer = new CommandLexer()
    const tokens = lexer.tokenize('show me what is installed')
    expect(tokens.some(t => t.type === 'verb')).toBe(true)
  })

  it('strips filler words', () => {
    const lexer = new CommandLexer()
    const tokens = lexer.tokenize('please install python for me')
    const fillerTokens = tokens.filter(t => t.type === 'filler')
    expect(fillerTokens.length).toBeGreaterThan(0)
    const meaningful = tokens.filter(t => t.type !== 'filler')
    expect(meaningful.some(t => t.value === 'install')).toBe(true)
  })

  it('detects conjunction for multi-step', () => {
    const lexer = new CommandLexer()
    const tokens = lexer.tokenize('install python and show installed')
    expect(tokens.some(t => t.type === 'conjunction')).toBe(true)
  })
})

describe('CommandParser', () => {
  it('parses simple install command', () => {
    const lexer = new CommandLexer()
    const parser = new CommandParser()
    const ast = parser.parse(lexer.tokenize('install python'))
    expect(ast.verb).toBe('install')
    expect(ast.object).toBe('python')
    expect(ast.sequence).toHaveLength(0)
  })

  it('parses multi-step command', () => {
    const lexer = new CommandLexer()
    const parser = new CommandParser()
    const ast = parser.parse(lexer.tokenize('install python and list'))
    expect(ast.verb).toBe('install')
    expect(ast.sequence).toHaveLength(1)
    expect(ast.sequence[0]?.verb).toBe('list')
  })

  it('parses list command with no object', () => {
    const lexer = new CommandLexer()
    const parser = new CommandParser()
    const ast = parser.parse(lexer.tokenize('list'))
    expect(ast.verb).toBe('list')
    expect(ast.object).toBeUndefined()
  })
})
