import { describe, it, expect } from 'vitest'
import { SlashCommandRegistry } from '../slash-commands.js'

describe('SlashCommandRegistry', () => {
  it('has /help built in', () => {
    const reg = new SlashCommandRegistry()
    expect(reg.get('help')).toBeDefined()
  })

  it('has /clear, /exit, /version, /status built in', () => {
    const reg = new SlashCommandRegistry()
    for (const name of ['clear', 'exit', 'version', 'status']) {
      expect(reg.get(name)).toBeDefined()
    }
  })

  it('dispatch() returns null for non-slash input', () => {
    const reg = new SlashCommandRegistry()
    expect(reg.dispatch('hello world')).toBeNull()
  })

  it('dispatch() calls registered command', () => {
    const reg = new SlashCommandRegistry()
    reg.register({ name: 'ping', description: 'pong', handle: () => 'pong' })
    expect(reg.dispatch('/ping')).toBe('pong')
  })

  it('dispatch() returns error message for unknown command', () => {
    const reg = new SlashCommandRegistry()
    expect(reg.dispatch('/unknown')).toContain('Unknown command')
  })

  it('/version returns version string', () => {
    const reg = new SlashCommandRegistry()
    expect(reg.dispatch('/version')).toContain('0.1.0-beta')
  })

  it('/help lists all commands', () => {
    const reg = new SlashCommandRegistry()
    const output = reg.dispatch('/help') ?? ''
    expect(output).toContain('/help')
    expect(output).toContain('/version')
  })
})
