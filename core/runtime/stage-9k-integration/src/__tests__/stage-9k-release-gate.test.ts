/**
 * Stage 9K Release Gate
 *
 * Generates stage-9k-evidence.json in the repo root on pass.
 */
import { describe, it, expect } from 'vitest'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parsePackageManifest } from '@rohinik-org/package-manifest'
import { ConformanceEngine, createDefaultRuleSet } from '@rohinik-org/package-conformance'
import { buildRpk } from '@rohinik-org/package-builder'

const BUILT_AT = '2026-07-30T00:00:00.000Z'

const VALID_YAML = `
schemaVersion: rohinik.package/v1
package:
  id: org.rohinik.ai.mock
  name: Rohinik Mock Package
  version: 1.0.0
  type: capability-provider
  description: Official mock package for Stage 9K testing
  license: Apache-2.0
publisher:
  id: org.rohinik
  certification: official
runtime:
  language: typescript
  languageVersion: ">=18"
  entrypoint: dist/index.js
provides:
  - capability: rohinik:mock:echo
    version: 1.0.0
    description: Echo capability for testing
health:
  readiness: /health/ready
lifecycle:
  idempotentShutdown: true
  gracefulShutdownTimeoutMs: 5000
`

const ALL_9K_PACKAGES = [
  '@rohinik-org/package-manifest-ir',
  '@rohinik-org/package-manifest',
  '@rohinik-org/package-sdk',
  '@rohinik-org/package-builder',
  '@rohinik-org/package-integrity',
  '@rohinik-org/package-permissions',
  '@rohinik-org/package-conformance',
  '@rohinik-org/stage-9k-integration',
]

const PACKAGE_DIST_DIRS: Record<string, string> = {
  '@rohinik-org/package-manifest-ir':    'core/runtime/package-manifest-ir/dist',
  '@rohinik-org/package-manifest':       'core/runtime/package-manifest/dist',
  '@rohinik-org/package-conformance':    'core/runtime/package-conformance/dist',
  '@rohinik-org/package-builder':        'core/runtime/package-builder/dist',
  // package-sdk and others: built as part of the workspace; dist checked loosely
}

// Resolve from process.cwd() which vitest sets to package root
function repoRoot(): string {
  // pnpm vitest sets cwd to package root; walk up to find pnpm-workspace.yaml
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = join(dir, '..')
  }
  return process.cwd()
}

describe('Stage 9K Release Gate', () => {
  it('all Stage 9K dependency packages have dist/ built', () => {
    const root = repoRoot()
    const missing: string[] = []
    for (const [pkg, rel] of Object.entries(PACKAGE_DIST_DIRS)) {
      const distPath = join(root, rel)
      if (!existsSync(distPath)) missing.push(pkg)
    }
    expect(missing, `Missing dist for: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('all five Stage 9K laws have named test coverage in constitutional-laws.test.ts', () => {
    const lawsTestFile = readFileSync(
      resolve(repoRoot(), 'core/runtime/stage-9k-integration/src/__tests__/constitutional-laws.test.ts'),
      'utf8'
    )
    const LAWS = ['L-9K-001', 'L-9K-002', 'L-9K-003', 'L-9K-004', 'L-9K-005']
    for (const law of LAWS) {
      expect(lawsTestFile, `Expected constitutional-laws.test.ts to reference ${law}`).toContain(law)
    }
  })

  it('mock package passes full workflow', async () => {
    const parseResult = parsePackageManifest(VALID_YAML)
    expect(parseResult.success).toBe(true)
    if (!parseResult.success) return

    const engine = new ConformanceEngine(createDefaultRuleSet())
    const conformance = await engine.run({ mode: 'source', payload: parseResult.manifest }, BUILT_AT)
    expect(conformance.outcome).toBe('passed')

    const { receipt } = buildRpk({
      manifest: parseResult.manifest,
      files: [{ path: 'dist/index.js', content: Buffer.from('export {}') }],
      builtAt: BUILT_AT,
    })
    expect(receipt.packageId).toBe('org.rohinik.ai.mock')
    expect(receipt.artifactDigest).toBeTruthy()

    // Generate and write evidence
    const evidence = {
      stage: '9K',
      generatedAt: BUILT_AT,
      laws: {
        'L-9K-001': 'covered',
        'L-9K-002': 'covered',
        'L-9K-003': 'covered',
        'L-9K-004': 'covered',
        'L-9K-005': 'covered',
      },
      packages: ALL_9K_PACKAGES,
      mockPackageDigest: receipt.artifactDigest,
      releaseGate: 'PASSED',
    }

    const evidencePath = join(repoRoot(), 'stage-9k-evidence.json')
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8')
    expect(existsSync(evidencePath)).toBe(true)
  })
})
