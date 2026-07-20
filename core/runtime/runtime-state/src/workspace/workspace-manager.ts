import { randomUUID } from 'node:crypto'
import { writeFile, readFile, readdir, unlink } from 'node:fs/promises'
import type { Workspace } from '../types.js'
import type { RuntimeRepository } from '../repository.js'

export class WorkspaceManager {
  constructor(private readonly repo: RuntimeRepository) {}

  async create(name: string): Promise<Workspace> {
    const workspace: Workspace = {
      id: randomUUID(),
      name,
      mountedProjects: [],
      variables: {},
      createdAt: new Date(),
      lastOpenedAt: new Date(),
    }
    await this._save(workspace)
    return workspace
  }

  async get(id: string): Promise<Workspace | undefined> {
    try {
      const raw = await readFile(this._file(id), 'utf8')
      return JSON.parse(raw) as Workspace
    } catch {
      return undefined
    }
  }

  async update(id: string, patch: Partial<Omit<Workspace, 'id' | 'createdAt'>>): Promise<Workspace> {
    const existing = await this.get(id)
    if (!existing) throw new Error(`Workspace not found: ${id}`)
    const updated: Workspace = { ...existing, ...patch, id, createdAt: existing.createdAt, lastOpenedAt: new Date() }
    await this._save(updated)
    return updated
  }

  async delete(id: string): Promise<void> {
    await unlink(this._file(id)).catch(() => undefined)
  }

  async list(): Promise<ReadonlyArray<Workspace>> {
    const dir = this.repo.path('workspaces')
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return []
    }
    const workspaces = await Promise.all(
      files.filter(f => f.endsWith('.json')).map(f => this.get(f.slice(0, -5)))
    )
    return workspaces.filter((w): w is Workspace => w !== undefined)
  }

  private async _save(workspace: Workspace): Promise<void> {
    await writeFile(this._file(workspace.id), JSON.stringify(workspace), 'utf8')
  }

  private _file(id: string): string {
    return this.repo.path('workspaces', `${id}.json`)
  }
}
