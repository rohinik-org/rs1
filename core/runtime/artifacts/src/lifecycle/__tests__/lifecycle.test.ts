import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LifecycleManager } from '../lifecycle-manager.js'
import { CapabilityCatalog, InstallManager } from '@rohinik-org/adapter-runtime'
import type { CapabilityAdapter, RawDiscoveryModel } from '@rohinik-org/adapter-runtime'

const TMP = join(tmpdir(), `aios-lifecycle-test-${Date.now()}`)
beforeEach(() => { mkdirSync(TMP, { recursive: true }) })
afterEach(() => { rmSync(TMP, { recursive: true, force: true }) })

function mockAdapter(id: string, version: string, toolNames: string[]): CapabilityAdapter {
  return {
    id, protocol: 'mcp', version,
    discover: vi.fn().mockResolvedValue({
      protocol: 'mcp', metadata: {},
      items: toolNames.map(name => ({ name, description: `${name} tool`, tags: ['filesystem'] })),
    } satisfies RawDiscoveryModel),
    validate: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
  }
}

describe('LifecycleManager', () => {
  it('upgrades an installed adapter to a new version', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const installMgr = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    const lifecycle = new LifecycleManager(catalog, installMgr)
    await installMgr.install(mockAdapter('@test/adapter', '1.0.0', ['read_file']), {}, new Map())
    const result = await lifecycle.upgrade(mockAdapter('@test/adapter', '2.0.0', ['read_file', 'write_file']), {}, new Map())
    expect(result.oldVersion).toBe('1.0.0')
    expect(result.newVersion).toBe('2.0.0')
    expect(result.record.status).toBe('ADMITTED')
  })

  it('uninstalls an installed adapter', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const installMgr = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    const lifecycle = new LifecycleManager(catalog, installMgr)
    await installMgr.install(mockAdapter('@test/adapter', '1.0.0', ['read_file']), {}, new Map())
    await lifecycle.uninstall('@test/adapter')
    const snapshot = await catalog.read()
    expect(snapshot.entries).toHaveLength(0)
  })

  it('throws uninstall for non-installed package', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const installMgr = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    const lifecycle = new LifecycleManager(catalog, installMgr)
    await expect(lifecycle.uninstall('@test/nonexistent')).rejects.toThrow('is not installed')
  })

  it('throws rollback when no disabled version exists', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const installMgr = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    const lifecycle = new LifecycleManager(catalog, installMgr)
    // Install but never disable — rollback should fail
    await installMgr.install(mockAdapter('@test/adapter', '1.0.0', ['read_file']), {}, new Map())
    await expect(lifecycle.rollback('@test/adapter')).rejects.toThrow('No previous version')
  })

  it('rollback re-enables a disabled entry', async () => {
    const catalog = new CapabilityCatalog(TMP)
    const installMgr = new InstallManager(catalog, TMP, '0.1.0-alpha.1', '1.0')
    const lifecycle = new LifecycleManager(catalog, installMgr)

    // Install and then manually disable it (simulating what a future upgrade-with-keep would do)
    await installMgr.install(mockAdapter('@test/adapter', '1.0.0', ['read_file']), {}, new Map())
    await catalog.setStatus('@test/adapter', 'disabled')

    // Rollback should re-enable it
    await lifecycle.rollback('@test/adapter')

    const snapshot = await catalog.read()
    const entry = snapshot.entries.find(e => e.id === '@test/adapter')
    expect(entry?.status).toBe('enabled')
  })
})
