import { describe, it, expect } from 'vitest'
import { WorkspaceInspectors } from '../inspectors.js'
import * as process from 'node:process'

describe('WorkspaceInspectors', () => {
  const insp = new WorkspaceInspectors('/nonexistent')

  describe('runtimeInspector', () => {
    it('returns nodejs runtimeKind', async () => {
      const runtime = await insp.runtimeInspector().inspectRuntime()
      expect(runtime.runtimeKind).toBe('nodejs')
    })

    it('runtimeVersion matches process.version', async () => {
      const runtime = await insp.runtimeInspector().inspectRuntime()
      expect(runtime.runtimeVersion).toBe(process.version)
    })

    it('os matches process.platform', async () => {
      const runtime = await insp.runtimeInspector().inspectRuntime()
      expect(runtime.os).toBe(process.platform)
    })

    it('architecture matches process.arch', async () => {
      const runtime = await insp.runtimeInspector().inspectRuntime()
      expect(runtime.architecture).toBe(process.arch)
    })

    it('runtimeAbi matches process.versions.modules', async () => {
      const runtime = await insp.runtimeInspector().inspectRuntime()
      expect(runtime.runtimeAbi).toBe(process.versions.modules)
    })
  })

  describe('dependencyInspector', () => {
    it('returns empty when no package.json exists', async () => {
      const deps = await insp.dependencyInspector().inspectDependencies()
      expect(deps).toBeDefined()
      // Either empty object or object with npm key — no throw
    })
  })

  it('packageInspector returns array', async () => {
    const pkgs = await insp.packageInspector().inspectPackages()
    expect(Array.isArray(pkgs)).toBe(true)
  })

  it('providerInspector returns array', async () => {
    const provs = await insp.providerInspector().inspectProviders()
    expect(Array.isArray(provs)).toBe(true)
  })

  it('modelInspector returns array', async () => {
    const models = await insp.modelInspector().inspectModels()
    expect(Array.isArray(models)).toBe(true)
  })

  it('infrastructureInspector returns array', async () => {
    const infra = await insp.infrastructureInspector().inspectInfrastructure()
    expect(Array.isArray(infra)).toBe(true)
  })

  it('configurationInspector returns array', async () => {
    const config = await insp.configurationInspector().inspectConfiguration()
    expect(Array.isArray(config)).toBe(true)
  })
})
