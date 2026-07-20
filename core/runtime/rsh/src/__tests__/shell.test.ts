import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { RohinikShell } from '../shell.js'

describe('RohinikShell', () => {
  it('showBanner() writes to output', () => {
    const output = new PassThrough()
    const shell = new RohinikShell({ input: new PassThrough(), output })
    shell.showBanner()
    const out = output.read() as Buffer
    expect(out.toString()).toContain('Runtime Shell')
  })

  it('commands getter returns SlashCommandRegistry', () => {
    const shell = new RohinikShell({ input: new PassThrough(), output: new PassThrough() })
    expect(shell.commands).toBeDefined()
    expect(shell.commands.get('help')).toBeDefined()
  })

  it('run() exits when input closes', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const shell = new RohinikShell({ input, output })
    const done = shell.run()
    input.end()
    await done
  })

  it('run() dispatches slash command to output', async () => {
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
})
