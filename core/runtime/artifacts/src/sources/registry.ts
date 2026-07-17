import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { SourceResolver, ResolvedPackage } from './resolver.js'
import type { InstallSource } from '@rohinik-org/adapter-sdk'
import { FileSourceResolver } from './file-resolver.js'
import { NpmSourceResolver } from './npm-resolver.js'
import { GitSourceResolver } from './git-resolver.js'
import { HttpsSourceResolver } from './https-resolver.js'

export class SourceResolverRegistry {
  private readonly resolvers = new Map<string, SourceResolver>()

  constructor() {
    this.register(new FileSourceResolver())
    this.register(new NpmSourceResolver())
    this.register(new GitSourceResolver())
    this.register(new HttpsSourceResolver())
  }

  register(resolver: SourceResolver): void {
    this.resolvers.set(resolver.scheme, resolver)
  }

  async resolve(source: InstallSource): Promise<ResolvedPackage> {
    const resolver = this.resolvers.get(source.scheme)
    if (!resolver) {
      throw new Error(
        `Unsupported install scheme '${source.scheme}'. Supported: ${[...this.resolvers.keys()].join(', ')}`
      )
    }
    const tempDir = join(tmpdir(), `aios-install-${randomUUID()}`)
    await mkdir(tempDir, { recursive: true })
    try {
      return await resolver.resolve(source.location, tempDir)
    } finally {
      if (source.scheme !== 'file') {
        await rm(tempDir, { recursive: true, force: true }).catch(() => { /* best effort */ })
      }
    }
  }
}
