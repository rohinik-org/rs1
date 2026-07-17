import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { CapabilityQuery } from '@rohinik-org/compiler'
import { LocalPluginSource } from '../sources/local-plugin-source.js'

function makeQuery(): CapabilityQuery {
  return { queryId: 'q-1', triggerId: 'trig-1', searchTerms: ['pdf'], producedAt: new Date().toISOString() }
}

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'aios-test-'))
})

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true })
})

describe('LocalPluginSource', () => {
  it('empty plugins dir returns empty array', async () => {
    await mkdir(join(tmpRoot, '.aios', 'plugins'), { recursive: true })
    const source = new LocalPluginSource(tmpRoot)
    const results = await source.discover(makeQuery())
    expect(results).toEqual([])
  })

  it('valid manifest produces candidate', async () => {
    const pluginDir = join(tmpRoot, '.aios', 'plugins', 'my-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(join(pluginDir, 'aios-plugin.json'), JSON.stringify({ name: 'my-plugin', description: 'test' }))
    const source = new LocalPluginSource(tmpRoot)
    const results = await source.discover(makeQuery())
    expect(results).toHaveLength(1)
    expect(results[0]?.name).toBe('my-plugin')
  })

  it('manifest with missing name is skipped', async () => {
    const pluginDir = join(tmpRoot, '.aios', 'plugins', 'bad-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(join(pluginDir, 'aios-plugin.json'), JSON.stringify({ description: 'no name' }))
    const source = new LocalPluginSource(tmpRoot)
    const results = await source.discover(makeQuery())
    expect(results).toEqual([])
  })

  it('sourceId is local', () => {
    const source = new LocalPluginSource(tmpRoot)
    expect(source.sourceId).toBe('local')
  })

  it('installSource.scheme is file', async () => {
    const pluginDir = join(tmpRoot, '.aios', 'plugins', 'p1')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(join(pluginDir, 'aios-plugin.json'), JSON.stringify({ name: 'p1' }))
    const source = new LocalPluginSource(tmpRoot)
    const results = await source.discover(makeQuery())
    expect(results[0]?.installSource.scheme).toBe('file')
  })
})
