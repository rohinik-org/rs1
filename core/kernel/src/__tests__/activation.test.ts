import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { pathToFileURL } from 'node:url'
import { ManifestParser } from '../manifest/parser.js'
import { ManifestValidator } from '../manifest/validator.js'
import { CapabilityDependencyGraph } from '../manifest/dependency-graph.js'
import { ManifestLoader } from '../manifest/loader.js'
import { RuntimeBuilder } from '../runtime/runtime-builder.js'
import { InMemoryCapabilityCatalog } from '../registry/catalog.js'
import { DefaultExecutionResolver } from '../resolver.js'
import { DEFAULT_SYSTEM_CONFIG } from '../domain/config.js'
import { createRuntimeServices } from '../services/index.js'
import type { RuntimeServices } from '../domain/context.js'

// ─── shared setup ────────────────────────────────────────────────────────────

const RUNTIME_VERSION = '0.1.0'

function makeComponents() {
  const parser = new ManifestParser()
  const validator = new ManifestValidator(DEFAULT_SYSTEM_CONFIG.runtime.manifest, RUNTIME_VERSION)
  const graph = new CapabilityDependencyGraph()
  return { parser, validator, graph }
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('activation integration', () => {
  let tmpDir: string
  let services: RuntimeServices
  let parser: ManifestParser
  let validator: ManifestValidator
  let graph: CapabilityDependencyGraph

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-activation-test-'))
    services = createRuntimeServices(DEFAULT_SYSTEM_CONFIG)
    const components = makeComponents()
    parser = components.parser
    validator = components.validator
    graph = components.graph
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ── Test 1 ──────────────────────────────────────────────────────────────────
  it('activates an extension and registers its capability in the catalog', async () => {
    const extDir = path.join(tmpDir, 'hello-ext')
    fs.mkdirSync(extDir)

    // Write extension entry as .mjs (ESM)
    fs.writeFileSync(
      path.join(extDir, 'index.mjs'),
      `export function activate(runtime) {
        runtime.registerCapability({
          metadata: {
            capabilityId: 'hello',
            name: 'Hello',
            version: '1.0.0',
            contractVersion: '1.0',
            description: 'test capability',
            category: 'utility',
            tags: [],
          },
          skills: [],
        })
      }`,
    )

    // Write manifest pointing to the .mjs file via file URL
    fs.writeFileSync(
      path.join(extDir, 'rohinik.manifest.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        runtimeVersion: '^0.1',
        type: 'capability',
        compatibility: 'stable',
        id: 'hello',
        name: 'Hello Extension',
        version: '1.0.0',
        contractVersion: '1.0',
        entry: pathToFileURL(path.join(extDir, 'index.mjs')).href,
      }),
    )

    // Build loader
    const loader = new ManifestLoader(parser, validator, graph)
    const plan = await loader.load([tmpDir])
    expect(plan.errors).toHaveLength(0)
    expect(plan.manifests).toHaveLength(1)

    // Build and activate runtime
    const catalog = new InMemoryCapabilityCatalog()
    const resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
    const runtime = new RuntimeBuilder(catalog, resolver, services).build()
    await runtime.activate(plan)

    expect(runtime.state).toBe('READY')
    expect(catalog.getAll().some(c => c.metadata.capabilityId === 'hello')).toBe(true)
    const helloCap = catalog.getAll().find(c => c.metadata.capabilityId === 'hello')!
    expect(helloCap.metadata.name).toBe('Hello')
    expect(helloCap.metadata.version).toBe('1.0.0')
  })

  // ── Test 2 ──────────────────────────────────────────────────────────────────
  it('ActivationPlan with errors causes runtime to enter FAILED state', async () => {
    // Create two extensions with a mutual dependency cycle: ext-a depends on ext-b, ext-b depends on ext-a
    for (const [id, depId] of [['ext-a', 'ext-b'], ['ext-b', 'ext-a']] as const) {
      const extDir = path.join(tmpDir, id)
      fs.mkdirSync(extDir)
      fs.writeFileSync(
        path.join(extDir, 'rohinik.manifest.json'),
        JSON.stringify({
          schemaVersion: '1.0',
          runtimeVersion: '^0.1',
          type: 'capability',
          compatibility: 'stable',
          id,
          name: `Extension ${id}`,
          version: '1.0.0',
          contractVersion: '1.0',
          entry: './index.js',
          // entry is intentionally not a real file — activate() bails early due to plan.errors
          requiresCapabilities: [{ id: depId, contractVersion: '^1.0' }],
        }),
      )
    }

    const loader = new ManifestLoader(parser, validator, graph)
    const plan = await loader.load([tmpDir])
    expect(plan.errors.some(e => e.type === 'CYCLE')).toBe(true)

    const catalog = new InMemoryCapabilityCatalog()
    const resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
    const runtime = new RuntimeBuilder(catalog, resolver, services).build()

    await expect(runtime.activate(plan)).rejects.toThrow()
    expect(runtime.state).toBe('FAILED')
  })

  // ── Test 3 ──────────────────────────────────────────────────────────────────
  it('extension context contains runtime, manifest, and logger', async () => {
    const extDir = path.join(tmpDir, 'ctx-ext')
    fs.mkdirSync(extDir)

    fs.writeFileSync(
      path.join(extDir, 'rohinik.manifest.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        runtimeVersion: '^0.1',
        type: 'capability',
        compatibility: 'stable',
        id: 'ctx-ext',
        name: 'Context Extension',
        version: '1.0.0',
        contractVersion: '1.0',
        entry: './index.js',
        // entry is intentionally not a real file — the _dynamicImport spy below intercepts
        // all dynamic imports before any filesystem access occurs, so the entry path is never used
      }),
    )

    const loader = new ManifestLoader(parser, validator, graph)
    const plan = await loader.load([tmpDir])
    expect(plan.errors).toHaveLength(0)
    expect(plan.manifests).toHaveLength(1)

    const catalog = new InMemoryCapabilityCatalog()
    const resolver = new DefaultExecutionResolver(DEFAULT_SYSTEM_CONFIG)
    const runtime = new RuntimeBuilder(catalog, resolver, services).build()

    // Capture the context passed to activate() without actually importing ESM
    const receivedContexts: unknown[] = []
    vi.spyOn(runtime as any, '_dynamicImport').mockResolvedValue({
      activate: (ctx: unknown) => { receivedContexts.push(ctx) },
    })

    await runtime.activate(plan)

    expect(receivedContexts).toHaveLength(1)
    expect(receivedContexts[0]).toBe(runtime)
    expect(runtime.services.logger).toBeDefined()
    expect(typeof runtime.services.logger.info).toBe('function')
    expect(typeof runtime.services.logger.error).toBe('function')
  })
})
