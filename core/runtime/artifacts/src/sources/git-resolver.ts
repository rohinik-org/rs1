import { createHash } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { SourceResolver, ResolvedPackage } from './resolver.js'
import { validateManifest } from '../manifest/schema.js'
import { upgradeManifest } from '../manifest/upgrader.js'

export class GitSourceResolver implements SourceResolver {
  readonly scheme = 'git'

  async resolve(location: string, tempDir: string): Promise<ResolvedPackage> {
    const cloneDir = join(tempDir, 'git-clone')
    await mkdir(cloneDir, { recursive: true })
    try {
      execSync(`git clone --depth 1 ${location} ${cloneDir}`, { stdio: 'pipe' })
      const manifestPath = join(cloneDir, 'rohinik-package.json')
      const legacyPath = join(cloneDir, 'rohinik-adapter.json')
      const rawPath = existsSync(manifestPath) ? manifestPath : legacyPath
      if (!existsSync(rawPath)) throw new Error(`No rohinik-package.json found in git repository ${location}`)
      const raw = JSON.parse(await readFile(rawPath, 'utf-8'))
      const manifest = validateManifest(upgradeManifest(raw))
      const contentHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
      return { localPath: cloneDir, manifest, contentHash }
    } catch (err) {
      throw new Error(`git resolver failed for '${location}': ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
