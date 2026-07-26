import { describe, it, expect } from 'vitest'
import { createManifestParser } from '../parser.js'
import { createManifestCompiler } from '../compiler.js'
import {
  createCapabilityRequirementBuilder,
  createProductionIdGenerator,
  createProductionClock,
} from '@rohinik-org/capability-contracts'

const MINIMAL_YAML = `
schemaVersion: rohinik.application/v1
application:
  id: com.example.app
  name: App
  version: 1.0.0
runtime:
  language: nodejs
capabilities:
  required: []
  optional: []
dependencyManagement:
  mode: immutable
resolution:
  allowMarketplace: false
  allowExternalRegistries: false
  allowLocalPackages: false
degradation:
  allowOptionalCapabilityFailure: false
`

// T-9F-38 — parser is synchronous
it('parse() returns ApplicationManifestParseResult synchronously (T-9F-38)', () => {
  const parser = createManifestParser()
  const result = parser.parse(MINIMAL_YAML)
  expect('status' in result).toBe(true)
  expect('then' in result).toBe(false)
})

// T-9F-39 — compile() is synchronous
it('compile() returns ManifestCompilationResult synchronously (T-9F-39)', () => {
  const parser = createManifestParser()
  const compiler = createManifestCompiler({
    requirementBuilder: createCapabilityRequirementBuilder({
      idGenerator: createProductionIdGenerator(),
      clock: createProductionClock(),
    }),
  })
  const parsed = parser.parse(MINIMAL_YAML)
  expect(parsed.status).toBe('valid')
  if (parsed.status !== 'valid') return
  const result = compiler.compile(parsed.manifest)
  expect('status' in result).toBe(true)
  expect('then' in result).toBe(false)
})

// T-9F-40 — parsed manifest has no provider identity fields (L-9F-001)
it('compiled requirements have no providerId field (L-9F-001)', () => {
  const WITH_CAP = MINIMAL_YAML.replace('required: []', `required:
    - id: ai:generate:text
      version: "^1.0"`)
  const parser = createManifestParser()
  const parsed = parser.parse(WITH_CAP)
  if (parsed.status !== 'valid') return
  const compiler = createManifestCompiler({
    requirementBuilder: createCapabilityRequirementBuilder({
      idGenerator: createProductionIdGenerator(),
      clock: createProductionClock(),
    }),
  })
  const compiled = compiler.compile(parsed.manifest)
  if (compiled.status !== 'compiled') return
  for (const req of compiled.requirementSet.requirements) {
    expect('providerId' in req).toBe(false)
  }
})

// T-9F-41 — no lock-related fields on manifest (L-9F-005)
it('manifest has no lockArtifact or resolutionPlan fields (L-9F-005)', () => {
  const parser = createManifestParser()
  const result = parser.parse(MINIMAL_YAML)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') return
  const manifest = result.manifest as unknown as Record<string, unknown>
  expect('lockArtifact' in manifest).toBe(false)
  expect('resolutionPlan' in manifest).toBe(false)
})

// T-9F-26 — observed mode compiles normally
it('observed mode compiles to requirement set without resolution plan', () => {
  const OBSERVED = MINIMAL_YAML.replace('mode: immutable', 'mode: observed')
  const parser = createManifestParser()
  const result = parser.parse(OBSERVED)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') return
  expect(result.manifest.dependencyManagement.mode).toBe('observed')
  const manifest = result.manifest as unknown as Record<string, unknown>
  expect('resolutionPlan' in manifest).toBe(false)
})

// T-9F-27 — immutable mode parses without filesystem access
it('immutable mode parses without filesystem access', () => {
  const parser = createManifestParser()
  const result = parser.parse(MINIMAL_YAML)
  expect(result.status).toBe('valid')
  if (result.status !== 'valid') return
  expect(result.manifest.dependencyManagement.mode).toBe('immutable')
  const manifest = result.manifest as unknown as Record<string, unknown>
  expect('lockArtifact' in manifest).toBe(false)
})

// Package dependency audit: application-manifest must not import acquisition/installer/lock packages
it('application-manifest package has no acquisition/installer/lock dependencies', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const packagePath = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { dependencies?: Record<string, string> }
  const deps = Object.keys(pkg.dependencies ?? {})
  const forbidden = ['@rohinik-org/acquisition', '@rohinik-org/installer', '@rohinik-org/lock']
  for (const dep of forbidden) {
    expect(deps).not.toContain(dep)
  }
})
