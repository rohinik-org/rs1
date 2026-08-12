/**
 * build-bundle.mjs — produce a self-contained runtime distribution tarball.
 *
 * Usage:
 *   node scripts/build-bundle.mjs [--version <ver>] [--out <dir>]
 *
 * Requires: `pnpm -r build` to have been run first (server/dist and all workspace
 * package dist/ dirs must exist).
 *
 * Produces in release/v<version>/:
 *   rohinik-runtime-<version>-win32-x64.tar.gz
 *   install-manifest-<version>-win32-x64.json
 *   checksums.sha256
 *
 * Bundle layout inside the tarball (rooted at "rohinik-runtime-<version>-win32-x64/"):
 *   dist/                ← all server/dist/*.js chunks (retain workspace: import refs)
 *   node_modules/
 *     fastify/           ← + full transitive closure (npm install --omit=dev)
 *     @rohinik-org/
 *       <name>/          ← each workspace package: dist/ + package.json
 *
 * The server's dist files import @rohinik-org/* packages by name; Node resolves them
 * by walking up from dist/ to find node_modules/@rohinik-org/<name>. This replicates
 * what pnpm does inside the monorepo without re-bundling.
 *
 * Reproducibility: tar entry order is sorted; mtime 0; uid/gid 0.
 * gz timestamp varies by gzip implementation — hash the tarball bytes, not the gz header.
 */

import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign }  from 'node:crypto'
import { execSync }           from 'node:child_process'
import {
  mkdirSync, mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync,
  readdirSync, statSync, existsSync, realpathSync,
} from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { tmpdir }             from 'node:os'
import { fileURLToPath }      from 'node:url'

const __dirname   = dirname(fileURLToPath(import.meta.url))
const RS1_ROOT    = join(__dirname, '..')
const SDK_ROOT    = join(RS1_ROOT, '..', 'Rohinik', 'sdk')
const SERVER_DIST   = join(RS1_ROOT, 'core', 'runtime', 'server', 'dist')
const SERVER_NM     = join(RS1_ROOT, 'core', 'runtime', 'server', 'node_modules')

// ── Parse args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function arg(name) {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}

// Read version from beta-version.json if not passed
let VERSION = arg('--version')
if (!VERSION) {
  const bvPath = join(SDK_ROOT, 'release', 'beta-version.json')
  try {
    VERSION = JSON.parse(readFileSync(bvPath, 'utf-8')).release
  } catch {
    console.error('Error: --version not set and release/beta-version.json not found')
    process.exit(1)
  }
}

const OS   = 'win32'
const ARCH = 'x64'
const PLATFORM_SUFFIX = `${OS}-${ARCH}`
const BUNDLE_NAME     = `rohinik-runtime-${VERSION}-${PLATFORM_SUFFIX}`
const TARBALL_NAME    = `${BUNDLE_NAME}.tar.gz`
const MANIFEST_NAME   = `install-manifest-${VERSION}-${PLATFORM_SUFFIX}.json`

const OUT_DIR = arg('--out') ?? join(RS1_ROOT, 'release', `v${VERSION}`)
mkdirSync(OUT_DIR, { recursive: true })

console.log(`Building runtime bundle v${VERSION} (${PLATFORM_SUFFIX})`)

// ── 1. Verify server/dist exists ─────────────────────────────────────────────

if (!readdirSync(SERVER_DIST).some(f => f === 'bin.js')) {
  console.error(`Error: ${SERVER_DIST}/bin.js not found — run pnpm -r build first`)
  process.exit(1)
}

// ── 2. Assemble bundle directory in temp ─────────────────────────────────────

const tmpWork    = mkdtempSync(join(tmpdir(), 'rhk-bundle-'))
const bundleRoot = join(tmpWork, BUNDLE_NAME)     // becomes tarball root

try {
  // dist/ ← all server/dist/*.js (chunks + index + bin)
  // bin.js imports ./chunk-*.js siblings so it must stay in dist/
  mkdirSync(join(bundleRoot, 'dist'), { recursive: true })
  for (const f of readdirSync(SERVER_DIST)) {
    if (f.endsWith('.js')) {
      cpSync(join(SERVER_DIST, f), join(bundleRoot, 'dist', f))
    }
  }

  // node_modules/@rohinik-org/<name>/ ← ALL workspace packages with built dist/
  // Walk the entire RS1 workspace to find every @rohinik-org/* package.
  // This handles transitive deps that don't appear in the server's direct node_modules.
  console.log('  Copying @rohinik-org workspace packages...')
  const workspacePkgs = findWorkspacePackages()
  let pkgCount = 0
  for (const { name, dir } of workspacePkgs) {
    const shortName = name.replace('@rohinik-org/', '')
    const destDir   = join(bundleRoot, 'node_modules', '@rohinik-org', shortName)
    mkdirSync(destDir, { recursive: true })
    const pkgJson = join(dir, 'package.json')
    if (existsSync(pkgJson)) {
      // Strip workspace: deps — they're meaningless in the bundle (all deps already in node_modules/)
      const p = JSON.parse(readFileSync(pkgJson, 'utf-8'))
      const clean = {}
      for (const k of ['name','version','type','exports','main','browser']) if (p[k] !== undefined) clean[k] = p[k]
      writeFileSync(join(destDir, 'package.json'), JSON.stringify(clean, null, 2), 'utf-8')
    }
    const distDir = join(dir, 'dist')
    if (existsSync(distDir)) { cpSync(distDir, join(destDir, 'dist'), { recursive: true }); pkgCount++ }
  }
  console.log(`  Copied ${pkgCount} @rohinik-org packages`)

  // node_modules/ ← install all external (non-workspace) deps for the runtime
  // Collect from: server package.json + all @rohinik-org workspace packages
  console.log('  Collecting external dependencies...')
  const externalDeps = collectExternalDeps()
  console.log(`  External deps: ${Object.keys(externalDeps).join(', ')}`)

  const nmTmp = mkdtempSync(join(tmpdir(), 'rhk-nm-'))
  writeFileSync(join(nmTmp, 'package.json'), JSON.stringify({
    name: 'rhks-runtime', version: VERSION, type: 'module',
    dependencies: externalDeps,
  }))
  execSync('npm install --omit=dev --silent --no-fund --no-audit', { cwd: nmTmp, stdio: 'pipe' })
  // Merge all installed packages into bundle node_modules; skip @rohinik-org (already copied)
  for (const entry of readdirSync(join(nmTmp, 'node_modules'), { withFileTypes: true })) {
    if (entry.name === '@rohinik-org') continue
    const src  = join(nmTmp, 'node_modules', entry.name)
    const dest = join(bundleRoot, 'node_modules', entry.name)
    const real = entry.isSymbolicLink() ? realpathSync(src) : src
    if (existsSync(real)) cpSync(real, dest, { recursive: true })
  }
  rmSync(nmTmp, { recursive: true, force: true })

  console.log(`  Bundle directory assembled: ${bundleRoot}`)
  console.log(`  Files: ${countFiles(bundleRoot)}`)

  // ── 3. Create deterministic tarball ──────────────────────────────────────
  // Sort entries for reproducibility; --mtime resets timestamps; --owner/--group 0
  // Note: system tar on Windows may not support all flags — use basic flags
  // Windows tar can't handle drive-letter absolute paths in -f arg.
  // Write to a local name in cwd (tmpWork), then move to OUT_DIR.
  const tarLocal = TARBALL_NAME
  const tarball  = join(OUT_DIR, TARBALL_NAME)
  const tarFlags = process.platform === 'win32'
    ? '-czf'
    : '--sort=name --mtime=@0 --owner=0 --group=0 -czf'

  execSync(
    `tar ${tarFlags} "${tarLocal}" "${BUNDLE_NAME}"`,
    { cwd: tmpWork, stdio: 'pipe' },
  )
  // Move into OUT_DIR
  cpSync(join(tmpWork, tarLocal), tarball)
  rmSync(join(tmpWork, tarLocal))

  // ── 4. SHA-256 hash of tarball ────────────────────────────────────────────
  const tarBytes = readFileSync(tarball)
  const sha256   = createHash('sha256').update(tarBytes).digest('hex')
  console.log(`  SHA-256: ${sha256}`)

  // ── 5. Write install-manifest JSON ───────────────────────────────────────
  // Provenance + signing requires knowing manifest hash too, so we write manifest
  // first with a placeholder provenanceHash, then overwrite after provenance is finalized.
  const signKeyB64  = process.env.ROHINIK_SIGN_KEY ?? null
  const signingPolicy = signKeyB64 ? 'required' : 'warn'
  if (!signKeyB64) {
    console.warn('\n  WARNING: ROHINIK_SIGN_KEY not set — bundle will be unsigned (signingPolicy: warn)')
    console.warn('  Set ROHINIK_SIGN_KEY=<base64-pkcs8-der> for an official signed release.\n')
  }

  const sourceCommit = (() => { try { return execSync('git rev-parse HEAD', { cwd: RS1_ROOT, stdio: 'pipe' }).toString().trim() } catch { return 'unknown' } })()
  const gitTag       = (() => { try { return execSync('git describe --tags --exact-match HEAD', { cwd: RS1_ROOT, stdio: 'pipe' }).toString().trim() } catch { return `v${VERSION}` } })()
  const npmVersion   = (() => { try { return execSync('npm --version', { stdio: 'pipe' }).toString().trim() } catch { return 'unknown' } })()

  // Load key ID from committed public key file
  const pubPemPath = join(RS1_ROOT, 'security', 'beta-signing.pub')
  const KEY_ID = (() => {
    try {
      const pubKey = createPublicKey(readFileSync(pubPemPath, 'utf-8'))
      const der = pubKey.export({ type: 'spki', format: 'der' })
      return createHash('sha256').update(der).digest('hex').slice(0, 16)
    } catch { return 'unknown' }
  })()

  const npmPackages = Object.entries(
    JSON.parse(readFileSync(join(SDK_ROOT, 'release', 'beta-version.json'), 'utf-8')).packages ?? {}
  ).map(([name, version]) => ({ name, version }))

  const manifest = {
    schemaVersion:       '1',
    runtimeVersion:      VERSION,
    releaseChannel:      VERSION.includes('beta') ? 'beta' : 'stable',
    platform:            { os: OS, arch: ARCH },
    entrypoint:          'dist/bin.js',
    protocols:           { execution: '1.0.0', agent: '1.0.0', control: '1.0.0' },
    integrity:           { algorithm: 'sha256', artifactHash: sha256 },
    config:              { schemaVersion: '1', defaultFile: 'rohinik.yaml' },
    minimumRequirements: { node: '>=22.0.0' },
    cliCompatibility:    { minCliVersion: '0.16.0-beta.1' },
    installedAt:         new Date(0).toISOString(),   // placeholder; CLI overwrites at install
    includedPackages:    [],
    signingPolicy,
    // provenance.provenanceHash filled in after provenance doc is written
  }

  const manifestPath = join(OUT_DIR, MANIFEST_NAME)
  // Write initial manifest (no provenance hash yet — will be updated below)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  // ── 5b. Generate + sign provenance document ───────────────────────────────
  const PROVENANCE_NAME = `release-provenance-${VERSION}.json`
  const provPath        = join(OUT_DIR, PROVENANCE_NAME)

  const manifestHash = createHash('sha256').update(readFileSync(manifestPath)).digest('hex')

  const provenanceDoc = {
    schemaVersion:  '1',
    buildTimestamp: new Date().toISOString(),
    release: { version: VERSION, gitTag, sourceCommit, sourceRepo: 'rohinik-org/rs1' },
    toolchain: { node: process.version, npm: npmVersion, platform: PLATFORM_SUFFIX },
    artifacts: [
      { name: TARBALL_NAME,  algorithm: 'sha256', hash: sha256 },
      { name: MANIFEST_NAME, algorithm: 'sha256', hash: manifestHash },
    ],
    npmPackages,
    signingPolicy,
    signature: { algorithm: 'Ed25519', keyId: KEY_ID, value: null },
  }

  if (signKeyB64) {
    const privKey  = createPrivateKey({ key: Buffer.from(signKeyB64, 'base64'), format: 'der', type: 'pkcs8' })
    const payload  = Buffer.from(canonicalJson(provenanceDoc))
    const sig      = cryptoSign(null, payload, privKey)
    provenanceDoc.signature.value = sig.toString('base64')
  }

  writeFileSync(provPath, JSON.stringify(provenanceDoc, null, 2), 'utf-8')
  const provHash = createHash('sha256').update(readFileSync(provPath)).digest('hex')
  console.log(`  Provenance: ${provPath}`)

  // ── 5c. Update manifest with provenance reference ─────────────────────────
  manifest.provenance = {
    version:       VERSION,
    gitTag,
    sourceCommit,
    sourceRepo:    'rohinik-org/rs1',
    provenanceHash: provHash,
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`  Manifest: ${manifestPath}`)

  // ── 6. Write checksums.sha256 ─────────────────────────────────────────────
  const checksumsPath  = join(OUT_DIR, 'checksums.sha256')
  const manifestHash2  = createHash('sha256').update(readFileSync(manifestPath)).digest('hex')
  const lines = [
    `${sha256}  ${TARBALL_NAME}`,
    `${manifestHash2}  ${MANIFEST_NAME}`,
    `${provHash}  ${PROVENANCE_NAME}`,
  ]
  // Preserve entries for other platforms/files not being replaced
  let existing = ''
  try { existing = readFileSync(checksumsPath, 'utf-8') } catch { /* first time */ }
  const keep = existing.split('\n').filter(l =>
    l.trim() && !l.includes(TARBALL_NAME) && !l.includes(MANIFEST_NAME) && !l.includes(PROVENANCE_NAME)
  )
  writeFileSync(checksumsPath, [...keep, ...lines, ''].join('\n'), 'utf-8')
  console.log(`  Checksums: ${checksumsPath}`)

  console.log(`\nDone. Artifacts in ${OUT_DIR}`)
  if (signKeyB64) console.log(`  Signed with key ${KEY_ID}`)
  else            console.log('  Unsigned bundle (signingPolicy: warn)')

} finally {
  rmSync(tmpWork, { recursive: true, force: true })
}

/** Canonical JSON: deterministic key-sorted serialization for signing. */
function canonicalJson(obj) {
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']'
  if (obj !== null && typeof obj === 'object')
    return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
  return JSON.stringify(obj)
}

function countFiles(dir) {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countFiles(join(dir, entry.name)) : 1
  }
  return n
}

/**
 * Find all @rohinik-org workspace packages with built dist/ directories.
 * Walks the RS1 source tree (excludes node_modules, dist).
 */
function findWorkspacePackages() {
  const result = []
  function walk(dir, depth = 0) {
    if (depth > 8) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
      const sub = join(dir, entry.name)
      const pkgPath = join(sub, 'package.json')
      if (existsSync(pkgPath)) {
        try {
          const p = JSON.parse(readFileSync(pkgPath, 'utf-8'))
          if (p.name?.startsWith('@rohinik-org/') && existsSync(join(sub, 'dist'))) {
            result.push({ name: p.name, dir: sub })
          }
        } catch { /* skip malformed */ }
      }
      walk(sub, depth + 1)
    }
  }
  walk(RS1_ROOT)
  return result
}

/**
 * Collect all non-workspace runtime dependencies: from the server package.json
 * and from all @rohinik-org workspace package.json files.
 */
function collectExternalDeps() {
  const deps = {}

  function addFromPkg(pkgJsonPath) {
    if (!existsSync(pkgJsonPath)) return
    const p = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
    for (const [name, ver] of Object.entries({ ...p.dependencies ?? {}, ...p.peerDependencies ?? {} })) {
      if (!name.startsWith('@rohinik-org') && !deps[name]) {
        deps[name] = ver.startsWith('workspace:') ? '*' : ver
      }
    }
  }

  // Server's own deps
  addFromPkg(join(RS1_ROOT, 'core', 'runtime', 'server', 'package.json'))

  // All workspace packages
  for (const { dir } of findWorkspacePackages()) {
    addFromPkg(join(dir, 'package.json'))
  }

  return deps
}
