import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FilesystemSource } from '../index.js'

async function makeTestCapability(baseDir: string, id: string, version = '1.0.0'): Promise<string> {
  const dir = join(baseDir, id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'capability-manifest.json'),
    JSON.stringify({ id, name: id, version, description: '', manifestVersion: 1, inputs: [], outputs: [], tier: 'local', tags: [], driverRef: 'filesystem' }),
  )
  return dir
}

describe('FilesystemSource', () => {
  it('finds capability by id term', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rhk-fs-src-'))
    try {
      await makeTestCapability(base, 'my-docker-tool')
      const source = new FilesystemSource([base])
      const results = await source.search({ term: 'docker' })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].manifest.id).toBe('my-docker-tool')
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('returns empty when no match', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rhk-fs-src-'))
    try {
      await makeTestCapability(base, 'unrelated-tool')
      const source = new FilesystemSource([base])
      const results = await source.search({ term: 'xyz-nonexistent' })
      expect(results).toHaveLength(0)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('fetch returns bundle with artifact', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rhk-fs-src-'))
    try {
      await makeTestCapability(base, 'fetch-tool')
      const source = new FilesystemSource([base])
      const candidates = await source.search({ term: 'fetch-tool' })
      const bundle = await source.fetch(candidates[0])
      expect(bundle.manifests).toHaveLength(1)
      expect(bundle.artifacts).toHaveLength(1)
      expect(bundle.checksum.length).toBeGreaterThan(0)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('verify returns true for valid bundle', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rhk-fs-src-'))
    try {
      await makeTestCapability(base, 'verify-tool')
      const source = new FilesystemSource([base])
      const candidates = await source.search({ term: 'verify-tool' })
      const bundle = await source.fetch(candidates[0])
      expect(await source.verify(bundle)).toBe(true)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
