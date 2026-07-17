import { createHash } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import type { SourceResolver, ResolvedPackage } from './resolver.js'
import { validateManifest } from '../manifest/schema.js'
import { upgradeManifest } from '../manifest/upgrader.js'

export class NpmSourceResolver implements SourceResolver {
  readonly scheme = 'npm'

  async resolve(location: string, tempDir: string): Promise<ResolvedPackage> {
    const extractDir = join(tempDir, 'npm-extract')
    await mkdir(extractDir, { recursive: true })
    try {
      const tarball = execSync(
        `npm pack ${location} --pack-destination ${tempDir} --json`,
        { cwd: tempDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      )
      const packResult = JSON.parse(tarball) as Array<{ filename: string }>
      const tarballName = packResult[0]?.filename
      if (!tarballName) throw new Error(`npm pack did not produce a tarball for ${location}`)
      const tarballPath = join(tempDir, tarballName)
      execSync(`tar -xzf ${tarballPath} -C ${extractDir} --strip-components=1`, { stdio: 'pipe' })
      const manifestPath = join(extractDir, 'rohinik-package.json')
      const legacyPath = join(extractDir, 'rohinik-adapter.json')
      const rawPath = existsSync(manifestPath) ? manifestPath : legacyPath
      if (!existsSync(rawPath)) throw new Error(`No rohinik-package.json found in npm package ${location}`)
      const raw = JSON.parse(await readFile(rawPath, 'utf-8'))
      const manifest = validateManifest(upgradeManifest(raw))
      const tarballBytes = await readFile(tarballPath)
      const contentHash = createHash('sha256').update(tarballBytes).digest('hex')
      return { localPath: extractDir, manifest, contentHash }
    } catch (err) {
      throw new Error(`npm resolver failed for '${location}': ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
