import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { RohinikShell, SlashCommandRegistry } from '../../src/index.js'

describe('RSH integration', () => {
  it('slash command /version outputs version in shell run', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const shell = new RohinikShell({ input, output })
    const chunks: string[] = []
    output.on('data', (c: Buffer) => chunks.push(c.toString()))
    const done = shell.run()
    input.write('/version\n')
    await new Promise<void>((r) => setTimeout(r, 50))
    input.end()
    await done
    expect(chunks.join('')).toContain('0.1.0-beta')
  })

  it('slash command /status shows READY', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const shell = new RohinikShell({ input, output })
    const chunks: string[] = []
    output.on('data', (c: Buffer) => chunks.push(c.toString()))
    const done = shell.run()
    input.write('/status\n')
    await new Promise<void>((r) => setTimeout(r, 50))
    input.end()
    await done
    expect(chunks.join('')).toContain('READY')
  })

  it('non-slash input echoes back', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const shell = new RohinikShell({ input, output })
    const chunks: string[] = []
    output.on('data', (c: Buffer) => chunks.push(c.toString()))
    const done = shell.run()
    input.write('hello world\n')
    await new Promise<void>((r) => setTimeout(r, 50))
    input.end()
    await done
    expect(chunks.join('')).toContain('hello world')
  })

  it('banner shown on run()', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const shell = new RohinikShell({ input, output })
    const chunks: string[] = []
    output.on('data', (c: Buffer) => chunks.push(c.toString()))
    const done = shell.run()
    input.end()
    await done
    expect(chunks.join('')).toContain('Runtime Shell')
  })

  it('unknown slash command shows error', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const shell = new RohinikShell({ input, output })
    const chunks: string[] = []
    output.on('data', (c: Buffer) => chunks.push(c.toString()))
    const done = shell.run()
    input.write('/nope\n')
    await new Promise<void>((r) => setTimeout(r, 50))
    input.end()
    await done
    expect(chunks.join('')).toContain('Unknown command')
  })

  it('custom slash command can be registered', () => {
    const reg = new SlashCommandRegistry()
    reg.register({ name: 'ping', description: 'test', handle: () => 'pong' })
    expect(reg.dispatch('/ping')).toBe('pong')
  })
})
