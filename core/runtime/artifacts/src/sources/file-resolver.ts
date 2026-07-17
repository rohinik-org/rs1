import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { SourceResolver, ResolvedPackage } from './resolver.js'
import { validateManifest } from '../manifest/schema.js'
import { upgradeManifest } from '../manifest/upgrader.js'

export class FileSourceResolver implements SourceResolver {
  readonly scheme = 'file'

  async resolve(location: string, _tempDir: string): Promise<ResolvedPackage> {
    const localPath = resolve(location)
    if (!existsSync(localPath)) {
      throw new Error(`File source not found: ${localPath}`)
    }
    const manifestPath = join(localPath, 'rohinik-package.json')
    const legacyPath = join(localPath, 'rohinik-adapter.json')
    const rawManifestPath = existsSync(manifestPath) ? manifestPath
      : existsSync(legacyPath) ? legacyPath
      : null
    if (!rawManifestPath) {
      throw new Error(`No rohinik-package.json or rohinik-adapter.json found in ${localPath}`)
    }
    const raw = JSON.parse(await readFile(rawManifestPath, 'utf-8'))
    const manifest = validateManifest(upgradeManifest(raw))
    const contentHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
    return { localPath, manifest, contentHash }
  }
}
