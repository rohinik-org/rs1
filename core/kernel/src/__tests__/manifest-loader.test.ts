import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { ManifestLoader } from '../manifest/loader.js'
import { ManifestParser } from '../manifest/parser.js'
import { ManifestValidator } from '../manifest/validator.js'
import { CapabilityDependencyGraph } from '../manifest/dependency-graph.js'
import type { ManifestConfig } from '../domain/config.js'

const VALID_MANIFEST = {
  schemaVersion: '1.0',
  runtimeVersion: '^0.1',
  type: 'capability',
  compatibility: 'stable',
  id: 'test-ext',
  name: 'Test Extension',
  version: '1.0.0',
  contractVersion: '1.0',
  entry: './src/index.js',
}

const makeLoader = (config: ManifestConfig = { rejectExperimental: false, scanPaths: [] }) => {
  const parser = new ManifestParser()
  const validator = new ManifestValidator(config, '0.1.0')
  const graph = new CapabilityDependencyGraph()
  return new ManifestLoader(parser, validator, graph)
}

describe('ManifestLoader', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-loader-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns empty ActivationPlan when scan path has no extensions', async () => {
    const loader = makeLoader()
    const plan = await loader.load([tmpDir])
    expect(plan.manifests).toHaveLength(0)
    expect(plan.errors).toHaveLength(0)
  })

  it('discovers and loads a valid extension', async () => {
    const extDir = path.join(tmpDir, 'my-extension')
    fs.mkdirSync(extDir)
    fs.writeFileSync(path.join(extDir, 'rohinik.manifest.json'), JSON.stringify(VALID_MANIFEST))

    const loader = makeLoader()
    const plan = await loader.load([tmpDir])
    expect(plan.manifests).toHaveLength(1)
    expect(plan.manifests[0]!.id).toBe('test-ext')
    expect(plan.errors).toHaveLength(0)
  })

  it('discovers multiple extensions in the same scan path', async () => {
    for (const id of ['ext-a', 'ext-b', 'ext-c']) {
      const extDir = path.join(tmpDir, id)
      fs.mkdirSync(extDir)
      fs.writeFileSync(path.join(extDir, 'rohinik.manifest.json'), JSON.stringify({ ...VALID_MANIFEST, id }))
    }

    const loader = makeLoader()
    const plan = await loader.load([tmpDir])
    expect(plan.manifests).toHaveLength(3)
  })

  it('skips directories without rohinik.manifest.json', async () => {
    const notAnExt = path.join(tmpDir, 'not-an-extension')
    fs.mkdirSync(notAnExt)
    fs.writeFileSync(path.join(notAnExt, 'package.json'), '{}')

    const loader = makeLoader()
    const plan = await loader.load([tmpDir])
    expect(plan.manifests).toHaveLength(0)
  })

  it('skips extensions with invalid JSON (logs warning, continues)', async () => {
    const extDir = path.join(tmpDir, 'bad-json')
    fs.mkdirSync(extDir)
    fs.writeFileSync(path.join(extDir, 'rohinik.manifest.json'), 'invalid-json{{{')

    const goodDir = path.join(tmpDir, 'good-ext')
    fs.mkdirSync(goodDir)
    fs.writeFileSync(path.join(goodDir, 'rohinik.manifest.json'), JSON.stringify(VALID_MANIFEST))

    const loader = makeLoader()
    const plan = await loader.load([tmpDir])
    expect(plan.manifests).toHaveLength(1)
    expect(plan.manifests[0]!.id).toBe('test-ext')
    expect(plan.warnings.length).toBeGreaterThan(0)
  })

  it('skips extensions failing validation (logs warning, continues)', async () => {
    const invalid = { ...VALID_MANIFEST, id: 'bad-schema', schemaVersion: '99.0' }
    const extDir = path.join(tmpDir, 'bad-schema')
    fs.mkdirSync(extDir)
    fs.writeFileSync(path.join(extDir, 'rohinik.manifest.json'), JSON.stringify(invalid))

    const loader = makeLoader()
    const plan = await loader.load([tmpDir])
    expect(plan.manifests).toHaveLength(0)
    expect(plan.warnings.length).toBeGreaterThan(0)
    expect(plan.warnings[0]).toContain('bad-schema')
  })

  it('includes dependency errors in the plan without aborting', async () => {
    // a depends on b, but b is not present
    const a = { ...VALID_MANIFEST, id: 'a', requiresCapabilities: [{ id: 'b', contractVersion: '^1.0' }] }
    const extDir = path.join(tmpDir, 'ext-a')
    fs.mkdirSync(extDir)
    fs.writeFileSync(path.join(extDir, 'rohinik.manifest.json'), JSON.stringify(a))

    const loader = makeLoader()
    const plan = await loader.load([tmpDir])
    expect(plan.errors.length).toBeGreaterThan(0)
    const err = plan.errors[0]!
    expect(err.type).toBe('MISSING_DEPENDENCY')
    expect(err.involvedIds).toContain('b')
  })

  it('scans multiple paths', async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-loader-test2-'))
    try {
      const extDir1 = path.join(tmpDir, 'ext-1')
      fs.mkdirSync(extDir1)
      fs.writeFileSync(path.join(extDir1, 'rohinik.manifest.json'), JSON.stringify({ ...VALID_MANIFEST, id: 'ext-1' }))

      const extDir2 = path.join(dir2, 'ext-2')
      fs.mkdirSync(extDir2)
      fs.writeFileSync(path.join(extDir2, 'rohinik.manifest.json'), JSON.stringify({ ...VALID_MANIFEST, id: 'ext-2' }))

      const loader = makeLoader()
      const plan = await loader.load([tmpDir, dir2])
      expect(plan.manifests).toHaveLength(2)
    } finally {
      fs.rmSync(dir2, { recursive: true })
    }
  })
})
