import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { collectFiles } from '../pipeline/file-collector.js'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

let tmpDir: string

beforeAll(async () => {
  tmpDir = join(tmpdir(), `re-test-${randomBytes(4).toString('hex')}`)
  await mkdir(join(tmpDir, 'src'), { recursive: true })
  await mkdir(join(tmpDir, 'node_modules', 'pkg'), { recursive: true })
  await writeFile(join(tmpDir, 'README.md'), '# Hello')
  await writeFile(join(tmpDir, 'src', 'index.ts'), 'export const x = 1')
  await writeFile(join(tmpDir, 'src', 'large.ts'), 'x'.repeat(60_000))
  await writeFile(join(tmpDir, 'node_modules', 'pkg', 'index.js'), 'excluded')
  await writeFile(join(tmpDir, 'image.png'), 'binary')
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('collectFiles', () => {
  it('collects .ts and .md files', async () => {
    const files = await collectFiles(tmpDir)
    const paths = files.map(f => f.path)
    expect(paths).toContain('README.md')
    expect(paths.some(p => p.includes('index.ts'))).toBe(true)
  })

  it('excludes node_modules', async () => {
    const files = await collectFiles(tmpDir)
    expect(files.every(f => !f.path.includes('node_modules'))).toBe(true)
  })

  it('excludes files over maxFileSizeBytes', async () => {
    const files = await collectFiles(tmpDir, { maxFileSizeBytes: 50_000 })
    expect(files.every(f => f.sizeBytes <= 50_000)).toBe(true)
    expect(files.some(f => f.path.includes('large.ts'))).toBe(false)
  })

  it('excludes non-matching extensions', async () => {
    const files = await collectFiles(tmpDir)
    expect(files.every(f => !f.path.endsWith('.png'))).toBe(true)
  })

  it('respects maxFiles limit', async () => {
    const files = await collectFiles(tmpDir, { maxFiles: 1 })
    expect(files.length).toBe(1)
  })

  it('returns relative paths', async () => {
    const files = await collectFiles(tmpDir)
    expect(files.every(f => !f.path.startsWith('/'))).toBe(true)
  })
})
