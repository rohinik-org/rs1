import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { SourceResolver, ResolvedPackage } from './resolver.js'
import { validateManifest } from '../manifest/schema.js'
import { upgradeManifest } from '../manifest/upgrader.js'

export class HttpsSourceResolver implements SourceResolver {
  readonly scheme = 'https'

  async resolve(location: string, tempDir: string): Promise<ResolvedPackage> {
    const extractDir = join(tempDir, 'https-extract')
    await mkdir(extractDir, { recursive: true })
    const url = location.startsWith('https://') ? location : `https://${location}`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const tarballPath = join(tempDir, 'download.tar.gz')
      await writeFile(tarballPath, buffer)
      execSync(`tar -xzf ${tarballPath} -C ${extractDir} --strip-components=1`, { stdio: 'pipe' })
      const manifestPath = join(extractDir, 'rohinik-package.json')
      const legacyPath = join(extractDir, 'rohinik-adapter.json')
      const rawPath = existsSync(manifestPath) ? manifestPath : legacyPath
      if (!existsSync(rawPath)) throw new Error(`No rohinik-package.json found in downloaded package from ${url}`)
      const raw = JSON.parse(await readFile(rawPath, 'utf-8'))
      const manifest = validateManifest(upgradeManifest(raw))
      const contentHash = createHash('sha256').update(buffer).digest('hex')
      return { localPath: extractDir, manifest, contentHash }
    } catch (err) {
      throw new Error(`https resolver failed for '${url}': ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
