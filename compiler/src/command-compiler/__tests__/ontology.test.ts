import { describe, it, expect } from 'vitest'
import { CommandOntology } from '../ontology.js'
import { OntologyResolver } from '../resolvers/ontology-resolver.js'
import type { CommandAST } from '../parser.js'

describe('CommandOntology', () => {
  it('maps install verb to install action', () => {
    expect(CommandOntology.resolveVerb('install')).toBe('install')
    expect(CommandOntology.resolveVerb('add')).toBe('install')
    expect(CommandOntology.resolveVerb('setup')).toBe('install')
  })

  it('maps show/display/list to list action', () => {
    expect(CommandOntology.resolveVerb('show')).toBe('list')
    expect(CommandOntology.resolveVerb('display')).toBe('list')
    expect(CommandOntology.resolveVerb('list')).toBe('list')
  })

  it('returns null for unknown verb', () => {
    expect(CommandOntology.resolveVerb('unknownverb')).toBeNull()
  })

  it('resolves python as system-tool target', () => {
    const result = CommandOntology.resolveTarget('python')
    expect(result).not.toBeNull()
    expect(result?.type).toBe('system-tool')
    expect(result?.id).toBe('python')
  })

  it('returns null for unknown target', () => {
    expect(CommandOntology.resolveTarget('unknowntarget')).toBeNull()
  })
})

describe('OntologyResolver', () => {
  it('resolves install python with high confidence', () => {
    const ast: CommandAST = {
      verb: 'install', object: 'python', conditions: [], qualifiers: [], sequence: [], rawTokens: [],
    }
    const resolver = new OntologyResolver()
    const result = resolver.resolve(ast, 'install python')
    expect(result.action).toBe('install')
    expect(result.target).toBe('python')
    expect(result.confidence).toBeGreaterThan(0.8)
  })

  it('resolves list with no object', () => {
    const ast: CommandAST = {
      verb: 'list', conditions: [], qualifiers: [], sequence: [], rawTokens: [],
    }
    const resolver = new OntologyResolver()
    const result = resolver.resolve(ast, 'list')
    expect(result.action).toBe('list')
    expect(result.target).toBeUndefined()
  })

  it('returns low confidence for unknown verb', () => {
    const ast: CommandAST = {
      verb: 'unknownverb', conditions: [], qualifiers: [], sequence: [], rawTokens: [],
    }
    const resolver = new OntologyResolver()
    const result = resolver.resolve(ast, 'unknownverb')
    expect(result.confidence).toBeLessThan(0.5)
  })
})
