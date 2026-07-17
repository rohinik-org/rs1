import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { CommandCompiler } from '../command-compiler.js'

const roots: string[] = []
async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `cc-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}
afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

describe('CommandCompiler', () => {
  it('compiles "install python" to CommandIR', async () => {
    const root = await tmpRoot()
    const compiler = new CommandCompiler(root)
    const result = await compiler.compile('install python')
    expect(result).toHaveLength(1)
    const ir = result[0]!
    expect(ir.kind).toBe('CommandIR')
    expect(ir.action).toBe('install')
    expect(ir.target).toBe('python')
    expect(ir.origin).toBe('natural-language')
    expect(ir.rawInput).toBe('install python')
  })

  it('compiles "list" to CommandIR with no target', async () => {
    const root = await tmpRoot()
    const compiler = new CommandCompiler(root)
    const result = await compiler.compile('list')
    expect(result[0]?.action).toBe('list')
    expect(result[0]?.target).toBeUndefined()
  })

  it('compiles multi-step "install python and list"', async () => {
    const root = await tmpRoot()
    const compiler = new CommandCompiler(root)
    const result = await compiler.compile('install python and list')
    const allActions = [result[0]?.action, ...(result[0]?.sequence.map(s => s.action) ?? [])]
    expect(allActions).toContain('install')
    expect(allActions).toContain('list')
  })

  it('uses catalog when target is already installed', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const catalog = { catalogVersion: '1.0', updatedAt: new Date().toISOString(), entries: [{ id: '@rohinik-org/mcp', version: '1.0.0', protocol: 'mcp', status: 'enabled', registeredCapabilityIds: ['filesystem.read'], installedAt: new Date().toISOString(), descriptorIrId: 'x', registrationRecordId: 'y', complianceLevel: 0 }] }
    await writeFile(join(root, '.aios', 'catalog.json'), JSON.stringify(catalog))
    const compiler = new CommandCompiler(root)
    const result = await compiler.compile('inspect filesystem.read')
    expect(result[0]?.resolution.source).toBe('catalog')
  })

  it('uses host inventory when target is installed on host', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const inv = { kind: 'HostInventory', schemaVersion: '1.0', inventoryId: 'abc', capturedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString(), platform: 'linux', arch: 'x64', nodeVersion: '22.0.0', resources: [{ id: 'rohinik://host/git', name: 'git', displayName: 'Git 2.48', resourceType: 'binary', detectedAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString(), platform: 'linux', healthStatus: 'AVAILABLE', confidence: 1, priority: 80, version: '2.48.0', installationSource: 'apt', metadata: {} }], resourceCount: 1, availableCount: 1, unavailableCount: 0 }
    await writeFile(join(root, '.aios', 'host-inventory.json'), JSON.stringify(inv))
    const compiler = new CommandCompiler(root)
    const result = await compiler.compile('install git')
    expect(result[0]?.resolution.source).toBe('host')
    expect(result[0]?.conditions).toContain('IF_NOT_REGISTERED')
  })

  it('returns confirmation REQUIRED for new installs', async () => {
    const root = await tmpRoot()
    const compiler = new CommandCompiler(root)
    const result = await compiler.compile('install docker')
    expect(result[0]?.confirmation).toBe('REQUIRED')
  })

  it('returns confirmation NONE for read-only commands', async () => {
    const root = await tmpRoot()
    const compiler = new CommandCompiler(root)
    const result = await compiler.compile('doctor')
    expect(result[0]?.confirmation).toBe('NONE')
  })
})
