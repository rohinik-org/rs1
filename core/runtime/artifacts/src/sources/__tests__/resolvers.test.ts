import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FileSourceResolver } from '../file-resolver.js'
import { SourceResolverRegistry } from '../registry.js'

const TMP = join(tmpdir(), `aios-resolver-test-${Date.now()}`)
beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

const VALID_V2_MANIFEST = {
  schemaVersion: '2.0', id: '@test/adapter', version: '1.0.0', type: 'adapter',
  name: 'Test Adapter', description: 'Test', minimumRuntime: '>=0.1.0', minimumSdk: '1.0',
}

describe('FileSourceResolver', () => {
  it('resolves a directory with rohinik-package.json', async () => {
    const adapterDir = join(TMP, 'adapter')
    mkdirSync(adapterDir, { recursive: true })
    writeFileSync(join(adapterDir, 'rohinik-package.json'), JSON.stringify(VALID_V2_MANIFEST))
    const resolver = new FileSourceResolver()
    const resolved = await resolver.resolve(adapterDir, TMP)
    expect(resolved.manifest.id).toBe('@test/adapter')
    expect(resolved.localPath).toBe(adapterDir)
    expect(resolved.contentHash).toBeTruthy()
  })

  it('upgrades v1 rohinik-adapter.json automatically', async () => {
    const adapterDir = join(TMP, 'v1-adapter')
    mkdirSync(adapterDir, { recursive: true })
    writeFileSync(join(adapterDir, 'rohinik-adapter.json'), JSON.stringify({
      id: '@test/v1', version: '1.0.0', protocol: 'mcp',
      minimumRuntime: '0.1.0', minimumSdk: '1.0', description: 'V1 adapter',
    }))
    const resolver = new FileSourceResolver()
    const resolved = await resolver.resolve(adapterDir, TMP)
    expect(resolved.manifest.schemaVersion).toBe('2.0')
    expect(resolved.manifest.type).toBe('adapter')
  })

  it('throws when directory has no manifest', async () => {
    const emptyDir = join(TMP, 'empty')
    mkdirSync(emptyDir)
    const resolver = new FileSourceResolver()
    await expect(resolver.resolve(emptyDir, TMP)).rejects.toThrow('No rohinik-package.json')
  })

  it('throws when directory does not exist', async () => {
    const resolver = new FileSourceResolver()
    await expect(resolver.resolve('/nonexistent/path', TMP)).rejects.toThrow('not found')
  })
})

describe('SourceResolverRegistry', () => {
  it('resolves file: scheme', async () => {
    const adapterDir = join(TMP, 'adapter')
    mkdirSync(adapterDir, { recursive: true })
    writeFileSync(join(adapterDir, 'rohinik-package.json'), JSON.stringify(VALID_V2_MANIFEST))
    const registry = new SourceResolverRegistry()
    const resolved = await registry.resolve({ scheme: 'file', location: adapterDir })
    expect(resolved.manifest.id).toBe('@test/adapter')
  })

  it('throws for unknown scheme', async () => {
    const registry = new SourceResolverRegistry()
    await expect(registry.resolve({ scheme: 'docker', location: 'myimage' }))
      .rejects.toThrow("Unsupported install scheme 'docker'")
  })
})
