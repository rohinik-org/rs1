import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { CatalogResolver } from '../resolvers/catalog-resolver.js'
import { HostResolver } from '../resolvers/host-resolver.js'
import { PackageManagerResolver } from '../resolvers/package-manager-resolver.js'

const roots: string[] = []

async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `resolver-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}

afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

describe('CatalogResolver', () => {
  it('detects when target is in catalog', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const catalog = { catalogVersion: '1.0', updatedAt: new Date().toISOString(), entries: [{ id: '@rohinik-org/mcp', version: '1.0.0', protocol: 'mcp', status: 'enabled', registeredCapabilityIds: ['filesystem.read'], installedAt: new Date().toISOString(), descriptorIrId: 'x', registrationRecordId: 'y', complianceLevel: 0 }] }
    await writeFile(join(root, '.aios', 'catalog.json'), JSON.stringify(catalog))
    const resolver = new CatalogResolver(root)
    const result = await resolver.resolve('filesystem.read')
    expect(result).not.toBeNull()
    expect(result?.source).toBe('catalog')
  })

  it('returns null when target not in catalog', async () => {
    const root = await tmpRoot()
    const resolver = new CatalogResolver(root)
    expect(await resolver.resolve('python')).toBeNull()
  })
})

describe('HostResolver', () => {
  it('detects registered host resource', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const inv = { kind: 'HostInventory', schemaVersion: '1.0', inventoryId: 'abc', capturedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString(), platform: 'linux', arch: 'x64', nodeVersion: '22.0.0', resources: [{ id: 'rohinik://host/python', name: 'python', displayName: 'Python 3.12.4', resourceType: 'binary', detectedAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString(), platform: 'linux', healthStatus: 'AVAILABLE', confidence: 1, priority: 80, version: '3.12.4', installationSource: 'apt', metadata: {} }], resourceCount: 1, availableCount: 1, unavailableCount: 0 }
    await writeFile(join(root, '.aios', 'host-inventory.json'), JSON.stringify(inv))
    const resolver = new HostResolver(root)
    const result = await resolver.resolve('python')
    expect(result).not.toBeNull()
    expect(result?.resolution.source).toBe('host')
  })

  it('returns null when not in host inventory', async () => {
    const root = await tmpRoot()
    const resolver = new HostResolver(root)
    expect(await resolver.resolve('python')).toBeNull()
  })
})

describe('PackageManagerResolver', () => {
  it('returns package-manager resolution for known tool', () => {
    const resolver = new PackageManagerResolver()
    const result = resolver.resolve('python')
    expect(result).not.toBeNull()
    expect(result?.source).toBe('package-manager')
  })

  it('returns null for unknown tool name', () => {
    const resolver = new PackageManagerResolver()
    expect(resolver.resolve('unknowntool12345')).toBeNull()
  })
})
