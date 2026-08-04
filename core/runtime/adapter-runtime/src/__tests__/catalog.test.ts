import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CapabilityCatalog } from '../catalog.js'
import type { InstalledCapabilityEntry } from '@rohinik-org/compiler'

const TMP = join(tmpdir(), `adapter-runtime-catalog-test-${Date.now()}`)
beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

function makeEntry(id: string, version = '1.0.0'): InstalledCapabilityEntry {
  return {
    id, version, protocol: 'mcp',
    source: { scheme: 'file', location: '/tmp/test' },
    installedAt: new Date().toISOString(),
    status: 'enabled',
    registeredCapabilityIds: [`${id}.read`],
    descriptorIrId: 'desc-1',
    registrationRecordId: 'reg-1',
    complianceLevel: 0,
  }
}

describe('CapabilityCatalog', () => {
  it('returns empty catalog when file does not exist', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(0)
  })

  it('adds and reads an entry', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@test/adapter'))
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]?.id).toBe('@test/adapter')
  })

  it('throws on duplicate add', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@test/adapter'))
    await expect(catalog.add(makeEntry('@test/adapter'))).rejects.toThrow('already installed')
  })

  it('removes an entry', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@test/adapter'))
    await catalog.remove('@test/adapter')
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(0)
  })

  it('throws remove for non-installed', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await expect(catalog.remove('@test/nonexistent')).rejects.toThrow('not installed')
  })

  it('setStatus updates entry status', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@test/adapter'))
    await catalog.setStatus('@test/adapter', 'disabled')
    const snapshot = await catalog.read()
    expect(snapshot.entries[0]?.status).toBe('disabled')
  })

  it('listEnabled returns only enabled entries', async () => {
    const catalog = new CapabilityCatalog(TMP)
    await catalog.add(makeEntry('@test/adapter1'))
    await catalog.add(makeEntry('@test/adapter2'))
    await catalog.setStatus('@test/adapter1', 'disabled')
    const enabled = await catalog.listEnabled()
    expect(enabled).toHaveLength(1)
    expect(enabled[0]?.id).toBe('@test/adapter2')
  })
})
