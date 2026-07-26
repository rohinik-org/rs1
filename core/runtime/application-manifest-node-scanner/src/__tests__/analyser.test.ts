import { it, expect } from 'vitest'
import { createManifestParser } from '@rohinik-org/application-manifest'
import { scanSource } from '../scanner.js'
import { analyseUsages } from '../analyser.js'

const MANIFEST_YAML = `
schemaVersion: rohinik.application/v1
application:
  id: com.example.app
  name: App
  version: 1.0.0
runtime:
  language: nodejs
capabilities:
  required:
    - id: ai:generate:text
      version: "^1.0"
  optional: []
dependencyManagement:
  mode: managed
resolution:
  allowMarketplace: true
  allowExternalRegistries: false
  allowLocalPackages: true
degradation:
  allowOptionalCapabilityFailure: true
`

const parser = createManifestParser()

it('declared capability usage produces no UNDECLARED_CAPABILITY_USAGE diagnostic', () => {
  const parsed = parser.parse(MANIFEST_YAML)
  if (parsed.status !== 'valid') return
  const scan = scanSource(`import { capability } from '@rohinik-org/sdk'\ncapability('ai:generate:text')`, 'app.ts')
  const result = analyseUsages(parsed.manifest, [scan])
  expect(result.diagnostics.filter(d => d.code === 'UNDECLARED_CAPABILITY_USAGE')).toHaveLength(0)
})

// T-9F-43 — undeclared usage is reported
it('undeclared capability usage emits UNDECLARED_CAPABILITY_USAGE warning (T-9F-43)', () => {
  const parsed = parser.parse(MANIFEST_YAML)
  if (parsed.status !== 'valid') return
  const scan = scanSource(`import { capability } from '@rohinik-org/sdk'\ncapability('ai:embed')`, 'app.ts')
  const result = analyseUsages(parsed.manifest, [scan])
  const diag = result.diagnostics.find(d => d.code === 'UNDECLARED_CAPABILITY_USAGE')
  expect(diag).toBeDefined()
  expect(diag?.severity).toBe('warning')
})

// T-9F-44 — result has no requirementSet
it('analysis result has no requirementSet field (T-9F-44)', () => {
  const parsed = parser.parse(MANIFEST_YAML)
  if (parsed.status !== 'valid') return
  const scan = scanSource(``, 'app.ts')
  const result = analyseUsages(parsed.manifest, [scan])
  expect('requirementSet' in result).toBe(false)
})

// T-9F-46 — advisory only (no errors)
it('undeclared usage is warning not error — runtime declaration is authoritative (T-9F-46)', () => {
  const parsed = parser.parse(MANIFEST_YAML)
  if (parsed.status !== 'valid') return
  const scan = scanSource(`import { capability } from '@rohinik-org/sdk'\ncapability('ai:embed')`, 'app.ts')
  const result = analyseUsages(parsed.manifest, [scan])
  expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
})

// parse failure propagates as info diagnostic
it('scan parse failure is reported as info diagnostic', () => {
  const parsed = parser.parse(MANIFEST_YAML)
  if (parsed.status !== 'valid') return
  const scan = scanSource(': broken: {{{{', 'broken.ts')
  const result = analyseUsages(parsed.manifest, [scan])
  expect(result.diagnostics.some(d => d.code === 'SOURCE_SCAN_PARSE_FAILED')).toBe(true)
})
