/**
 * bootstrap-npm.mjs — one-time namespace bootstrap for all 8 Rohinik packages.
 *
 * npm Trusted Publishing requires each package to already exist on the registry
 * before a trusted publisher can be configured. This script publishes a
 * non-release bootstrap version under a non-default dist-tag to claim the
 * package names without consuming the real release version.
 *
 * Bootstrap version: 0.16.0-beta.0-bootstrap
 * Bootstrap dist-tag: bootstrap  (never 'latest' or 'beta')
 *
 * Prerequisites:
 *   - npm login or NPM_TOKEN env var set (classic automation token)
 *   - pnpm -r build already run (dist/ dirs must exist)
 *   - Run from RS1 root
 *
 * Usage:
 *   NPM_TOKEN=<token> node scripts/bootstrap-npm.mjs
 *   node scripts/bootstrap-npm.mjs  # uses npm login session
 *
 * After this script completes successfully:
 *   1. Configure Trusted Publishers on npmjs.com for all 8 packages
 *   2. Then proceed with OIDC-based BR-6 release workflow
 *
 * This script is safe to re-run if a package was already bootstrapped —
 * it skips packages that already exist on npm.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RS1_ROOT  = join(__dirname, '..')
const SDK_ROOT  = process.env.SDK_ROOT ?? join(RS1_ROOT, '..', 'Rohinik', 'sdk')

const BOOTSTRAP_VERSION = '0.16.0-beta.0-bootstrap'
const BOOTSTRAP_TAG     = 'bootstrap'

// All 8 packages with their source directories
// install-manifest lives in RS1; the other 7 in SDK
const PACKAGES = [
  { name: '@rohinik-org/install-manifest', dir: join(RS1_ROOT, 'core', 'runtime', 'install-manifest') },
  { name: '@rohinik-org/cli',              dir: join(SDK_ROOT, 'packages', 'cli') },
  { name: '@rohinik-org/client',           dir: join(SDK_ROOT, 'packages', 'client') },
  { name: '@rohinik-org/capability-sdk',   dir: join(SDK_ROOT, 'packages', 'capability-sdk') },
  { name: '@rohinik-org/agent-sdk',        dir: join(SDK_ROOT, 'packages', 'agent-sdk') },
  { name: '@rohinik-org/provider-sdk',     dir: join(SDK_ROOT, 'packages', 'provider-sdk') },
  { name: '@rohinik-org/package-sdk',      dir: join(SDK_ROOT, 'packages', 'package-sdk') },
  { name: '@rohinik-org/testing',          dir: join(SDK_ROOT, 'packages', 'testing') },
]

console.log(`Bootstrap version: ${BOOTSTRAP_VERSION}`)
console.log(`Bootstrap dist-tag: ${BOOTSTRAP_TAG}`)
console.log()

let skipped = 0
let published = 0
let failed = 0

for (const pkg of PACKAGES) {
  const pkgJsonPath = join(pkg.dir, 'package.json')

  if (!existsSync(pkgJsonPath)) {
    console.error(`[bootstrap] ERROR: ${pkgJsonPath} not found — run pnpm -r build first`)
    process.exit(1)
  }

  // Check if package already exists on npm — skip if so
  const alreadyExists = await checkNpmExists(pkg.name, BOOTSTRAP_VERSION)
  if (alreadyExists) {
    console.log(`[bootstrap] SKIP: ${pkg.name}@${BOOTSTRAP_VERSION} already on npm`)
    skipped++
    continue
  }

  // Write bootstrap package.json (only version field changed)
  const original = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  const bootstrap = { ...original, version: BOOTSTRAP_VERSION }
  writeFileSync(pkgJsonPath, JSON.stringify(bootstrap, null, 2) + '\n', 'utf-8')

  try {
    console.log(`[bootstrap] Publishing ${pkg.name}@${BOOTSTRAP_VERSION} ...`)
    execSync(`npm publish --tag ${BOOTSTRAP_TAG} --access public`, {
      cwd: pkg.dir,
      stdio: 'inherit',
      env: {
        ...process.env,
        // npm respects NODE_AUTH_TOKEN when registry-url is set; pass NPM_TOKEN as both
        NODE_AUTH_TOKEN: process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN ?? '',
      },
    })
    console.log(`[bootstrap] OK: ${pkg.name}`)
    published++
  } catch {
    console.error(`[bootstrap] FAILED: ${pkg.name}`)
    failed++
  } finally {
    // Always restore original package.json — do not leave bootstrap version in tree
    writeFileSync(pkgJsonPath, JSON.stringify(original, null, 2) + '\n', 'utf-8')
  }
}

console.log()
console.log(`Bootstrap complete: ${published} published, ${skipped} skipped, ${failed} failed`)

if (failed > 0) {
  console.error('Some packages failed to publish. Fix errors above and re-run.')
  process.exit(1)
}

console.log()
console.log('Next steps:')
console.log('  1. Configure Trusted Publishers on npmjs.com for all 8 packages')
console.log('     RS1 packages: repo=rohinik-org/rs1, workflow=release.yml, env=npm-publish')
console.log('     SDK packages: repo=rohinik-org/sdk, workflow=release.yml, env=npm-publish')
console.log('  2. Configure GitHub Environments (see BR-6 activation checklist)')
console.log('  3. Run dry-run: Actions → Release → Run workflow → dry_run=true')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function checkNpmExists(pkg, version) {
  try {
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(pkg)}/${encodeURIComponent(version)}`,
    )
    return res.ok
  } catch {
    return false
  }
}
