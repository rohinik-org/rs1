import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { RuntimeRepository } from '../repository.js'

describe('RuntimeRepository', () => {
  let repo: RuntimeRepository
  let root: string

  beforeEach(() => {
    root = join(tmpdir(), `rohinik-test-${randomUUID()}`)
    repo = new RuntimeRepository(root)
  })

  it('root defaults to ~/.rohinik/runtime when no arg', () => {
    const r = new RuntimeRepository()
    expect(r.root).toContain('.rohinik')
  })

  it('init() creates all subdirectories', async () => {
    await repo.init()
    const { existsSync } = await import('node:fs')
    for (const sub of ['sessions', 'workspaces', 'jobs', 'history', 'cache', 'locks', 'downloads', 'artifacts', 'ipc', 'state', 'logs']) {
      expect(existsSync(join(root, sub))).toBe(true)
    }
  })

  it('path() returns correct path for subdir', async () => {
    await repo.init()
    expect(repo.path('sessions')).toBe(join(root, 'sessions'))
  })

  it('path() appends extra parts', async () => {
    await repo.init()
    expect(repo.path('sessions', 'abc.json')).toBe(join(root, 'sessions', 'abc.json'))
  })
})
