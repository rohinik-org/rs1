import { describe, it, expect } from 'vitest'
import { LocalShellDriver } from '../local-shell-driver.js'
import type { ExecutionContext } from '@rohinik-org/capability-manifest'

function ctx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return { requestId: 'r', executionId: 'e', sessionId: 's', workspaceId: 'w', permissions: [], ...overrides }
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe('LocalShellDriver', () => {
  const driver = new LocalShellDriver()

  it('shell:execute → raw RESULT + COMPLETE', async () => {
    const events = await collect(driver.execute({ capabilityId: 'shell:execute', input: { command: 'echo hello' }, context: ctx() }))
    const result = events.find(e => e.type === 'RESULT')
    expect(result).toBeDefined()
    expect((result?.payload as { stdout: string }).stdout.trim()).toBe('hello')
    expect(events[events.length - 1]?.type).toBe('COMPLETE')
  })

  it('shell:execute-stream → raw OUTPUT* + COMPLETE', async () => {
    const events = await collect(driver.execute({ capabilityId: 'shell:execute-stream', input: { command: 'echo line1' }, context: ctx() }))
    const outputs = events.filter(e => e.type === 'OUTPUT')
    expect(outputs.length).toBeGreaterThan(0)
    expect(events[events.length - 1]?.type).toBe('COMPLETE')
  })

  it('shell:current-directory → raw RESULT = a string', async () => {
    const events = await collect(driver.execute({ capabilityId: 'shell:current-directory', input: {}, context: ctx() }))
    const result = events.find(e => e.type === 'RESULT')
    expect(typeof result?.payload).toBe('string')
  })

  it('health() → { status: healthy, checkedAt: Date }', async () => {
    const h = await driver.health()
    expect(h.status).toBe('healthy')
    expect(h.checkedAt).toBeInstanceOf(Date)
  })

  it('shell:terminal → raw ERROR NOT_IMPLEMENTED', async () => {
    const events = await collect(driver.execute({ capabilityId: 'shell:terminal', input: {}, context: ctx() }))
    expect((events.find(e => e.type === 'ERROR')?.payload as { code: string }).code).toBe('NOT_IMPLEMENTED')
  })

  it('AbortSignal → raw ERROR CANCELLED', async () => {
    const controller = new AbortController()
    controller.abort()
    const events = await collect(driver.execute({ capabilityId: 'shell:execute', input: { command: 'echo x' }, context: ctx({ signal: controller.signal }) }))
    expect((events.find(e => e.type === 'ERROR')?.payload as { code: string }).code).toBe('CANCELLED')
  })
})
