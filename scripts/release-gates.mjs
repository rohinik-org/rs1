/**
 * release-gates.mjs — fail-closed pre/post-release assertion checks.
 *
 * Usage:
 *   node scripts/release-gates.mjs --check-version <tag>
 *   node scripts/release-gates.mjs --check-npm <package> <version> <dist-tag>
 *   node scripts/release-gates.mjs --check-provenance <tag>
 *   node scripts/release-gates.mjs --check-github-release <tag>
 *   node scripts/release-gates.mjs --check-all-sdk-packages <dist-tag>
 *
 * Environment:
 *   SDK_ROOT   — path to SDK repo root (required for --check-version, --check-all-sdk-packages)
 *   GH_TOKEN   — GitHub token (required for --check-github-release)
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RS1_ROOT  = join(__dirname, '..')

// SDK_ROOT: env override, else sibling of RS1 under ../Rohinik/sdk (local dev)
const SDK_ROOT = process.env.SDK_ROOT ?? join(RS1_ROOT, '..', 'Rohinik', 'sdk')

const args = process.argv.slice(2)
const cmd  = args[0]

if (!cmd) {
  console.error('Usage: node release-gates.mjs --check-<subcommand> ...')
  process.exit(1)
}

// ── Subcommand dispatch ───────────────────────────────────────────────────────

try {
  switch (cmd) {
    case '--check-version':         await checkVersion(args[1]);                           break
    case '--check-npm':             await checkNpm(args[1], args[2], args[3]);             break
    case '--check-provenance':      checkProvenance(args[1]);                              break
    case '--check-github-release':  await checkGithubRelease(args[1]);                    break
    case '--check-all-sdk-packages': await checkAllSdkPackages(args[1]);                  break
    default:
      console.error(`Unknown subcommand: ${cmd}`)
      process.exit(1)
  }
} catch (e) {
  console.error(`[gate] FAIL: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}

// ── --check-version <tag> ─────────────────────────────────────────────────────
// Verifies git tag === beta-version.json "release" === install-manifest version.

async function checkVersion(tag) {
  if (!tag) throw new Error('--check-version requires <tag>')

  const version = tag.replace(/^v/, '')

  const bvPath = join(SDK_ROOT, 'release', 'beta-version.json')
  if (!existsSync(bvPath)) throw new Error(`beta-version.json not found at ${bvPath}`)
  const bv = JSON.parse(readFileSync(bvPath, 'utf-8'))
  if (bv.release !== version) {
    throw new Error(`Tag version mismatch: tag=${version}, beta-version.json.release=${bv.release}`)
  }

  const imPkgPath = join(RS1_ROOT, 'core', 'runtime', 'install-manifest', 'package.json')
  if (!existsSync(imPkgPath)) throw new Error(`install-manifest/package.json not found at ${imPkgPath}`)
  const imPkg = JSON.parse(readFileSync(imPkgPath, 'utf-8'))
  if (imPkg.version !== version) {
    throw new Error(`install-manifest version mismatch: tag=${version}, package.json.version=${imPkg.version}`)
  }

  console.log(`[gate] version OK: ${version}`)
}

// ── --check-npm <package> <version> <dist-tag> ────────────────────────────────
// Polls npm registry until package@version is available under dist-tag.

async function checkNpm(pkg, version, distTag) {
  if (!pkg || !version || !distTag) {
    throw new Error('--check-npm requires <package> <version> <dist-tag>')
  }

  const maxAttempts = 10
  const backoffMs   = 6_000

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) {
      console.log(`[gate] npm: attempt ${i + 1}/${maxAttempts}, waiting ${backoffMs / 1000}s...`)
      await sleep(backoffMs)
    }

    try {
      // Check version exists
      const vRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/${encodeURIComponent(version)}`)
      if (!vRes.ok) {
        console.log(`[gate] npm: ${pkg}@${version} not yet visible (HTTP ${vRes.status})`)
        continue
      }

      // Check dist-tag
      const tagRes = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`)
      if (!tagRes.ok) continue
      const meta     = await tagRes.json()
      const tagVer   = meta['dist-tags']?.[distTag]
      if (tagVer !== version) {
        console.log(`[gate] npm: dist-tag ${distTag} is ${tagVer}, not ${version} yet`)
        continue
      }

      console.log(`[gate] npm OK: ${pkg}@${version} (dist-tag ${distTag})`)
      return
    } catch (e) {
      console.log(`[gate] npm: fetch error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(`${pkg}@${version} not found on npm under dist-tag ${distTag} after ${maxAttempts} attempts`)
}

// ── --check-provenance <tag> ──────────────────────────────────────────────────
// Verifies signature is present and signingPolicy is 'required'.

function checkProvenance(tag) {
  if (!tag) throw new Error('--check-provenance requires <tag>')

  const version     = tag.replace(/^v/, '')
  const provPath    = join(RS1_ROOT, 'release', tag, `release-provenance-${version}.json`)
  if (!existsSync(provPath)) throw new Error(`provenance file not found: ${provPath}`)

  const doc = JSON.parse(readFileSync(provPath, 'utf-8'))
  if (doc.signingPolicy !== 'required') {
    throw new Error(`signingPolicy must be 'required', got: ${doc.signingPolicy}`)
  }
  if (!doc.signature?.value || doc.signature.value === 'null') {
    throw new Error('signature.value is absent or null — artifact is unsigned')
  }

  console.log(`[gate] provenance OK: ${version}, keyId=${doc.signature.keyId}`)
}

// ── --check-github-release <tag> ──────────────────────────────────────────────
// Verifies all 4 required assets are attached to the GitHub Release.

async function checkGithubRelease(tag) {
  if (!tag) throw new Error('--check-github-release requires <tag>')

  const version = tag.replace(/^v/, '')

  let assetsJson
  try {
    assetsJson = execSync(`gh release view ${tag} --json assets --jq '[.assets[].name]'`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (e) {
    throw new Error(`gh release view failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  const assets = JSON.parse(assetsJson.trim())

  const required = [
    (n) => n.startsWith(`rohinik-runtime-${version}-`) && n.endsWith('.tar.gz'),
    (n) => n.startsWith(`install-manifest-${version}-`) && n.endsWith('.json'),
    (n) => n === `release-provenance-${version}.json`,
    (n) => n === 'checksums.sha256',
  ]
  const labels = ['tarball', 'install-manifest', 'provenance', 'checksums']

  for (let i = 0; i < required.length; i++) {
    if (!assets.some(required[i])) {
      throw new Error(`GitHub Release missing asset: ${labels[i]}`)
    }
  }

  console.log(`[gate] GitHub Release assets OK: ${assets.join(', ')}`)
}

// ── --check-all-sdk-packages <dist-tag> ───────────────────────────────────────
// Verifies all publishOrder packages are on npm under dist-tag.

async function checkAllSdkPackages(distTag) {
  if (!distTag) throw new Error('--check-all-sdk-packages requires <dist-tag>')

  const bvPath = join(SDK_ROOT, 'release', 'beta-version.json')
  if (!existsSync(bvPath)) throw new Error(`beta-version.json not found at ${bvPath}`)
  const bv = JSON.parse(readFileSync(bvPath, 'utf-8'))

  for (const pkg of bv.publishOrder) {
    const version = bv.packages[pkg]
    if (!version) throw new Error(`no version for ${pkg} in beta-version.json`)
    await checkNpm(pkg, version, distTag)
  }

  console.log(`[gate] all SDK packages OK under dist-tag ${distTag}`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
