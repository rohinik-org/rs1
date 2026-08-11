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

import { createHash }        from 'node:crypto'
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
  }
  const manifestPath = join(OUT_DIR, MANIFEST_NAME)
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
  console.log(`  Manifest: ${manifestPath}`)

  // ── 6. Write checksums.sha256 ─────────────────────────────────────────────
  const checksumsPath = join(OUT_DIR, 'checksums.sha256')
  const checksumLine  = `${sha256}  ${TARBALL_NAME}\n`
  // Append to checksums file (supports multiple platforms in one file)
  let existing = ''
  try { existing = readFileSync(checksumsPath, 'utf-8') } catch { /* first time */ }
  const filtered = existing.split('\n').filter(l => !l.includes(TARBALL_NAME)).join('\n')
  writeFileSync(checksumsPath, (filtered ? filtered + '\n' : '') + checksumLine, 'utf-8')
  console.log(`  Checksums: ${checksumsPath}`)

  console.log(`\nDone. Artifacts in ${OUT_DIR}`)

} finally {
  rmSync(tmpWork, { recursive: true, force: true })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
