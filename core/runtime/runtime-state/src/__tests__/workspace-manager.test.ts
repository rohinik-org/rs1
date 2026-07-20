import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { RuntimeRepository } from '../repository.js'
import { WorkspaceManager } from '../workspace/workspace-manager.js'

describe('WorkspaceManager', () => {
  let mgr: WorkspaceManager

  beforeEach(async () => {
    const repo = new RuntimeRepository(join(tmpdir(), `rohinik-ws-test-${randomUUID()}`))
    await repo.init()
    mgr = new WorkspaceManager(repo)
  })

  it('create() returns workspace with given name', async () => {
    const ws = await mgr.create('my-project')
    expect(ws.name).toBe('my-project')
  })

  it('create() assigns an id', async () => {
    const ws = await mgr.create('project')
    expect(ws.id).toBeTruthy()
  })

  it('get() returns persisted workspace', async () => {
    const ws = await mgr.create('project')
    const fetched = await mgr.get(ws.id)
    expect(fetched?.name).toBe('project')
  })

  it('get() returns undefined for unknown id', async () => {
    expect(await mgr.get('nope')).toBeUndefined()
  })

  it('update() persists patch', async () => {
    const ws = await mgr.create('old')
    const updated = await mgr.update(ws.id, { name: 'new' })
    expect(updated.name).toBe('new')
    expect((await mgr.get(ws.id))?.name).toBe('new')
  })

  it('delete() removes workspace', async () => {
    const ws = await mgr.create('tmp')
    await mgr.delete(ws.id)
    expect(await mgr.get(ws.id)).toBeUndefined()
  })

  it('list() returns all workspaces', async () => {
    await mgr.create('a')
    await mgr.create('b')
    const all = await mgr.list()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('mountedProjects is empty on creation', async () => {
    const ws = await mgr.create('project')
    expect(ws.mountedProjects).toHaveLength(0)
  })

  it('update() throws for unknown workspace', async () => {
    await expect(mgr.update('ghost', { name: 'x' })).rejects.toThrow('Workspace not found')
  })
})
