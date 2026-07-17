import { describe, it, expect } from 'vitest'
import type { CommandIR, CommandCondition, CommandResolution } from '../command-ir.js'

describe('CommandIR', () => {
  it('accepts a minimal install command', () => {
    const ir: CommandIR = {
      kind: 'CommandIR',
      schemaVersion: '1.0',
      commandId: 'uuid-001',
      action: 'install',
      target: 'python',
      conditions: [],
      options: {},
      confirmation: 'REQUIRED',
      sequence: [],
      confidence: 0.95,
      origin: 'natural-language',
      rawInput: 'Install Python',
      resolution: {
        source: 'package-manager',
        resolvedId: 'Python.Python.3',
        explanation: 'Python not found on host; will install via package manager',
      },
    }
    expect(ir.kind).toBe('CommandIR')
    expect(ir.action).toBe('install')
    expect(ir.confirmation).toBe('REQUIRED')
  })

  it('accepts all CommandCondition values', () => {
    const conditions: CommandCondition[] = [
      'IF_NOT_PRESENT', 'IF_NOT_REGISTERED', 'IF_OUTDATED', 'IF_HEALTHY', 'UNLESS_REGISTERED',
    ]
    for (const c of conditions) {
      const ir: CommandIR = {
        kind: 'CommandIR', schemaVersion: '1.0', commandId: 'x',
        action: 'install', conditions: [c], options: {},
        confirmation: 'NONE', sequence: [], confidence: 1, origin: 'cli',
        rawInput: 'test',
        resolution: { source: 'ontology', explanation: 'test' },
      }
      expect(ir.conditions).toContain(c)
    }
  })

  it('accepts all resolution sources', () => {
    const sources: CommandResolution['source'][] = [
      'catalog', 'host', 'package-manager', 'semantic-pack', 'ontology', 'llm', 'manual',
    ]
    for (const source of sources) {
      const r: CommandResolution = { source, explanation: 'test' }
      expect(r.source).toBe(source)
    }
  })

  it('accepts all origin values', () => {
    const origins: CommandIR['origin'][] = [
      'natural-language', 'cli', 'rest', 'sdk', 'voice',
    ]
    for (const origin of origins) {
      const ir: CommandIR = {
        kind: 'CommandIR', schemaVersion: '1.0', commandId: 'x',
        action: 'list', conditions: [], options: {}, confirmation: 'NONE',
        sequence: [], confidence: 1, origin, rawInput: 'list',
        resolution: { source: 'ontology', explanation: '' },
      }
      expect(ir.origin).toBe(origin)
    }
  })

  it('accepts multi-step sequence', () => {
    const step: CommandIR = {
      kind: 'CommandIR', schemaVersion: '1.0', commandId: 'step-1',
      action: 'list', conditions: [], options: {}, confirmation: 'NONE',
      sequence: [], confidence: 0.98, origin: 'natural-language', rawInput: 'show installed',
      resolution: { source: 'ontology', explanation: '' },
    }
    const ir: CommandIR = {
      kind: 'CommandIR', schemaVersion: '1.0', commandId: 'parent',
      action: 'install', target: 'python', conditions: [], options: {},
      confirmation: 'REQUIRED', sequence: [step], confidence: 0.95,
      origin: 'natural-language', rawInput: 'install python and show installed',
      resolution: { source: 'package-manager', explanation: '' },
    }
    expect(ir.sequence).toHaveLength(1)
    expect(ir.sequence[0]?.action).toBe('list')
  })
})
