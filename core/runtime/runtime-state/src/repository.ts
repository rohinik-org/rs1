import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'

const SUBDIRS = [
  'sessions', 'workspaces', 'jobs', 'history',
  'cache', 'locks', 'downloads', 'artifacts',
  'ipc', 'state', 'logs',
] as const

export type RepositorySubdir = typeof SUBDIRS[number]

export class RuntimeRepository {
  readonly root: string

  constructor(root?: string) {
    this.root = root ?? join(homedir(), '.rohinik', 'runtime')
  }

  async init(): Promise<void> {
    for (const sub of SUBDIRS) {
      await mkdir(join(this.root, sub), { recursive: true })
    }
  }

  path(sub: RepositorySubdir, ...parts: string[]): string {
    return join(this.root, sub, ...parts)
  }
}
