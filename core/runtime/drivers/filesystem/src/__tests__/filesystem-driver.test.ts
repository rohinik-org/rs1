import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FilesystemDriver } from '../filesystem-driver.js'
import type { ExecutionContext } from '@rohinik-org/capability-manifest'

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    requestId: 'req-1',
    executionId: 'exec-1',
    sessionId: 'sess-1',
    workspaceId: 'ws-1',
    permissions: [],
    ...overrides,
  }
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const e of iter) out.push(e)
  return out
}

let dir: string
let driver: FilesystemDriver

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fs-driver-test-'))
  driver = new FilesystemDriver()
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('FilesystemDriver', () => {
  it('read-file → raw STARTED/RESULT/COMPLETE (no sequence/timestamp — runtime job)', async () => {
    const file = join(dir, 'hello.txt')
    await writeFile(file, 'hello world', 'utf8')
    const events = await collect(driver.execute({ capabilityId: 'filesystem:read-file', input: { path: file }, context: makeContext() }))
    expect(events[0]?.type).toBe('STARTED')
    const result = events.find(e => e.type === 'RESULT')
    expect(result?.payload).toBe('hello world')
    expect(events[events.length - 1]?.type).toBe('COMPLETE')
    // runtime fields absent — driver emits raw
    expect((events[0] as Record<string, unknown>).sequence).toBeUndefined()
  })

  it('write-file → RESULT { written: true }; file exists on disk', async () => {
    const file = join(dir, 'out.txt')
    const events = await collect(driver.execute({ capabilityId: 'filesystem:write-file', input: { path: file, content: 'test' }, context: makeContext() }))
    expect(events.find(e => e.type === 'RESULT')?.payload).toEqual({ written: true })
    expect(await readFile(file, 'utf8')).toBe('test')
  })

  it('list-directory → RESULT with entries array', async () => {
    await writeFile(join(dir, 'a.txt'), '', 'utf8')
    await writeFile(join(dir, 'b.txt'), '', 'utf8')
    const events = await collect(driver.execute({ capabilityId: 'filesystem:list-directory', input: { path: dir }, context: makeContext() }))
    const result = events.find(e => e.type === 'RESULT')
    expect(Array.isArray(result?.payload)).toBe(true)
    expect((result?.payload as { name: string }[]).map(e => e.name).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('file-exists → RESULT true/false', async () => {
    const file = join(dir, 'exists.txt')
    await writeFile(file, '', 'utf8')
    const e1 = await collect(driver.execute({ capabilityId: 'filesystem:file-exists', input: { path: file }, context: makeContext() }))
    expect(e1.find(e => e.type === 'RESULT')?.payload).toBe(true)
    const e2 = await collect(driver.execute({ capabilityId: 'filesystem:file-exists', input: { path: file + '.nope' }, context: makeContext() }))
    expect(e2.find(e => e.type === 'RESULT')?.payload).toBe(false)
  })

  it('copy → PROGRESS events (percent 0–100) + COMPLETE', async () => {
    const src = join(dir, 'src.txt')
    const dest = join(dir, 'dest.txt')
    await writeFile(src, 'data', 'utf8')
    const events = await collect(driver.execute({ capabilityId: 'filesystem:copy', input: { src, dest }, context: makeContext() }))
    const progress = events.filter(e => e.type === 'PROGRESS')
    expect(progress.length).toBeGreaterThanOrEqual(2)
    for (const p of progress) {
      const pct = (p.payload as { percent: number }).percent
      expect(pct).toBeGreaterThanOrEqual(0)
      expect(pct).toBeLessThanOrEqual(100)
    }
    expect(events[events.length - 1]?.type).toBe('COMPLETE')
  })

  it('filesystem:watch → raw ERROR NOT_IMPLEMENTED', async () => {
    const events = await collect(driver.execute({ capabilityId: 'filesystem:watch', input: {}, context: makeContext() }))
    const err = events.find(e => e.type === 'ERROR')
    expect((err?.payload as { code: string }).code).toBe('NOT_IMPLEMENTED')
  })

  it('AbortSignal → raw ERROR CANCELLED', async () => {
    const controller = new AbortController()
    controller.abort()
    const events = await collect(driver.execute({ capabilityId: 'filesystem:read-file', input: { path: '/any' }, context: makeContext({ signal: controller.signal }) }))
    expect(events.find(e => e.type === 'ERROR')?.payload).toMatchObject({ code: 'CANCELLED' })
  })

  it('driver id matches grammar ^[a-z0-9-]+$', () => {
    expect(driver.descriptor.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('all capability IDs match grammar ^[a-z0-9-]+:[a-z0-9-]+$', async () => {
    const { FILESYSTEM_CAPABILITY_IDS } = await import('../filesystem-driver.js')
    for (const id of FILESYSTEM_CAPABILITY_IDS) {
      expect(id).toMatch(/^[a-z0-9-]+:[a-z0-9-]+$/)
    }
  })
})
