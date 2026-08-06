/**
 * check-sdk-compat.ts
 *
 * Checks current @rohinik-org/client SDK exports against docs/compat/sdk-api-baseline.json.
 *
 * Run: npx tsx scripts/check-sdk-compat.ts --sdk-root <path-to-sdk>
 * Exit 0 = compatible. Exit 1 = breaking change detected.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const BASELINE_FILE = resolve(REPO_ROOT, 'docs/compat/sdk-api-baseline.json')

function parseArgs(): { sdkRoot: string } {
  const idx = process.argv.indexOf('--sdk-root')
  const sdkRoot = idx !== -1 ? process.argv[idx + 1] : process.env['ROHINIK_SDK_ROOT']
  if (!sdkRoot) {
    console.error('Usage: check-sdk-compat.ts --sdk-root <path-to-sdk-repo>')
    process.exit(1)
  }
  return { sdkRoot }
}

interface ExportEntry {
  name: string
  kind: string
  typeOnly: boolean
  signature?: string
  constructor?: string
  publicMembers?: Array<{ name: string; kind: string; readonly?: boolean; type?: string; signature?: string }>
  extendsClass?: string
  type?: string
  value?: string
  members?: Array<{ name: string; optional: boolean; type?: string }>
}

interface Baseline {
  exports: ExportEntry[]
}

interface Violation {
  kind: 'breaking' | 'compatible'
  location: string
  message: string
}

const violations: Violation[] = []

function breaking(location: string, message: string): void {
  violations.push({ kind: 'breaking', location, message })
}
function compatible(location: string, message: string): void {
  violations.push({ kind: 'compatible', location, message })
}

function normalizeTypeText(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
}

// ── Signature comparison ──────────────────────────────────────────────────────

function signaturesCompatible(baseline: string, current: string, location: string): void {
  if (baseline === current) return
  // Normalize whitespace for comparison
  const b = normalizeTypeText(baseline)
  const c = normalizeTypeText(current)
  if (b === c) return
  breaking(location, `Signature changed: was "${b}", now "${c}"`)
}

// ── Class member comparison ───────────────────────────────────────────────────

function checkClassMembers(
  name: string,
  baseMembers: ExportEntry['publicMembers'],
  currMembers: ExportEntry['publicMembers'],
): void {
  if (!baseMembers) return
  const currMap = new Map((currMembers ?? []).map(m => [m.name, m]))

  for (const baseMember of baseMembers) {
    const loc = `${name}.${baseMember.name}`
    const curr = currMap.get(baseMember.name)
    if (!curr) {
      breaking(loc, `Public member removed: ${baseMember.name}`)
      continue
    }
    if (baseMember.kind !== curr.kind) {
      breaking(loc, `Member kind changed: ${baseMember.kind} → ${curr.kind}`)
    }
    if (baseMember.kind === 'method' && baseMember.signature && curr.signature) {
      signaturesCompatible(baseMember.signature, curr.signature, loc)
    }
    if (baseMember.kind === 'property' && baseMember.type && curr.type && baseMember.type !== curr.type) {
      breaking(loc, `Property type changed: ${baseMember.type} → ${curr.type}`)
    }
  }

  for (const currMember of (currMembers ?? [])) {
    if (!baseMembers.find(m => m.name === currMember.name)) {
      compatible(name, `New public member: ${currMember.name}`)
    }
  }
}

// ── Extract current SDK exports ───────────────────────────────────────────────
// Reuse same extraction logic as generate script (simplified — just what we need to compare)

function extractCurrentExports(sdkRoot: string): ExportEntry[] {
  const indexPath = resolve(sdkRoot, 'packages/client/src/index.ts')
  const tsconfigPath = resolve(sdkRoot, 'packages/client/tsconfig.json')

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, resolve(sdkRoot, 'packages/client'))
  const program = ts.createProgram({ rootNames: [indexPath], options: parsedConfig.options })
  const checker = program.getTypeChecker()
  const indexSource = program.getSourceFile(indexPath)

  if (!indexSource) {
    console.error(`Cannot load source file: ${indexPath}`)
    process.exit(1)
  }

  const exports: ExportEntry[] = []

  for (const stmt of indexSource.statements) {
    if (!ts.isExportDeclaration(stmt)) continue
    const typeOnly = stmt.isTypeOnly
    const clause = stmt.exportClause
    if (!clause || !ts.isNamedExports(clause)) continue

    for (const el of clause.elements) {
      const name = el.name.text
      const elTypeOnly = typeOnly || el.isTypeOnly
      const sym = checker.getExportSpecifierLocalTargetSymbol(el)
      if (!sym) { exports.push({ name, kind: 'unknown', typeOnly: elTypeOnly }); continue }
      const decls = sym.getDeclarations() ?? []
      const decl = decls[0]
      if (!decl) { exports.push({ name, kind: 'unknown', typeOnly: elTypeOnly }); continue }

      if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
        const sig = checker.getSignaturesOfType(checker.getTypeOfSymbolAtLocation(sym, decl), ts.SignatureKind.Call)[0]
        let sigText = '(...args: unknown[]) => unknown'
        if (sig) {
          const params = sig.getParameters().map(p => {
            const pDecl = p.getDeclarations()?.[0]
            const optional = pDecl && ts.isParameter(pDecl) && (pDecl.questionToken !== undefined || pDecl.initializer !== undefined) ? '?' : ''
            const typeStr = checker.typeToString(checker.getTypeOfSymbolAtLocation(p, decl))
            return `${p.name}${optional}: ${typeStr}`
          })
          const ret = checker.typeToString(sig.getReturnType())
          sigText = `(${params.join(', ')}) => ${ret}`
        }
        exports.push({ name, kind: 'function', typeOnly: false, signature: normalizeTypeText(sigText) })

      } else if (ts.isClassDeclaration(decl)) {
        const entry: ExportEntry = { name, kind: 'class', typeOnly: false }
        const ctorDecl = decl.members.find(ts.isConstructorDeclaration)
        if (ctorDecl) {
          const params = ctorDecl.parameters.map(p => {
            const optional = p.questionToken !== undefined || p.initializer !== undefined ? '?' : ''
            const typeStr = p.type ? normalizeTypeText(p.type.getText(decl.getSourceFile())) : 'unknown'
            return `${p.name.getText(decl.getSourceFile())}${optional}: ${typeStr}`
          })
          entry.constructor = `(${params.join(', ')})`
        }
        if (decl.heritageClauses) {
          for (const hc of decl.heritageClauses) {
            if (hc.token === ts.SyntaxKind.ExtendsKeyword) {
              entry.extendsClass = hc.types[0]?.expression.getText(decl.getSourceFile())
            }
          }
        }
        const members: ExportEntry['publicMembers'] = []
        for (const member of decl.members) {
          const isPrivate = member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)
          const isProtected = member.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword)
          if (isPrivate || isProtected || ts.isConstructorDeclaration(member)) continue
          if (ts.isPropertyDeclaration(member) && member.name) {
            const mName = member.name.getText(decl.getSourceFile())
            const readonly = member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword)
            const typeStr = member.type ? normalizeTypeText(member.type.getText(decl.getSourceFile())) : 'unknown'
            members.push({ name: mName, kind: 'property', readonly, type: typeStr })
          }
          if (ts.isMethodDeclaration(member) && member.name) {
            const mName = member.name.getText(decl.getSourceFile())
            const params = member.parameters.map(p => {
              const optional = p.questionToken !== undefined || p.initializer !== undefined ? '?' : ''
              const typeStr = p.type ? normalizeTypeText(p.type.getText(decl.getSourceFile())) : 'unknown'
              return `${p.name.getText(decl.getSourceFile())}${optional}: ${typeStr}`
            })
            const retType = member.type ? normalizeTypeText(member.type.getText(decl.getSourceFile())) : 'unknown'
            members.push({ name: mName, kind: 'method', signature: `(${params.join(', ')}) => ${retType}` })
          }
        }
        if (members.length) entry.publicMembers = members
        exports.push(entry)

      } else if (ts.isInterfaceDeclaration(decl)) {
        exports.push({ name, kind: 'interface', typeOnly: true })
      } else if (ts.isTypeAliasDeclaration(decl)) {
        exports.push({ name, kind: 'type', typeOnly: true })
      } else if (ts.isVariableDeclaration(decl)) {
        const type = checker.getTypeOfSymbolAtLocation(sym, decl)
        const entry: ExportEntry = { name, kind: 'const', typeOnly: false, type: normalizeTypeText(checker.typeToString(type)) }
        if (type.isStringLiteral()) entry.value = type.value
        exports.push(entry)
      } else {
        exports.push({ name, kind: 'unknown', typeOnly: elTypeOnly })
      }
    }
  }
  return exports
}

// ── Main ──────────────────────────────────────────────────────────────────────

function run(): void {
  const { sdkRoot } = parseArgs()
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as Baseline
  const currentExports = extractCurrentExports(sdkRoot)

  const baselineMap = new Map(baseline.exports.map(e => [e.name, e]))
  const currentMap  = new Map(currentExports.map(e => [e.name, e]))

  // Removed exports
  for (const [name, baseEntry] of baselineMap) {
    if (!currentMap.has(name)) {
      if (baseEntry.typeOnly) {
        compatible(name, `Type-only export removed: ${name} (may break type consumers)`)
      } else {
        breaking(name, `Runtime export removed: ${name}`)
      }
    }
  }

  // New exports (compatible)
  for (const name of currentMap.keys()) {
    if (!baselineMap.has(name)) {
      compatible(name, `New export: ${name}`)
    }
  }

  // Changed exports
  for (const [name, baseEntry] of baselineMap) {
    const currEntry = currentMap.get(name)
    if (!currEntry) continue // removal already handled above

    const loc = name

    // Kind change
    if (baseEntry.kind !== currEntry.kind) {
      breaking(loc, `Export kind changed: ${baseEntry.kind} → ${currEntry.kind}`)
      continue
    }

    // Function signature
    if (baseEntry.kind === 'function' && baseEntry.signature && currEntry.signature) {
      signaturesCompatible(baseEntry.signature, currEntry.signature, loc)
    }

    // Class
    if (baseEntry.kind === 'class') {
      if (baseEntry.constructor && currEntry.constructor && baseEntry.constructor !== currEntry.constructor) {
        // Constructor change — check if it's just added optional params
        breaking(loc, `Constructor signature changed: was "${baseEntry.constructor}", now "${currEntry.constructor}"`)
      }
      checkClassMembers(name, baseEntry.publicMembers, currEntry.publicMembers)
    }

    // Const value
    if (baseEntry.kind === 'const' && baseEntry.value !== undefined && currEntry.value !== baseEntry.value) {
      breaking(loc, `Constant value changed: "${baseEntry.value}" → "${currEntry.value}"`)
    }
  }

  const breakingViolations = violations.filter(v => v.kind === 'breaking')
  const compatibleChanges  = violations.filter(v => v.kind === 'compatible')

  if (compatibleChanges.length) {
    console.log('Compatible changes (pass):')
    for (const v of compatibleChanges) console.log(`  ✓ ${v.location}: ${v.message}`)
    console.log()
  }

  if (breakingViolations.length === 0) {
    console.log(`✓ SDK API compatibility: all exports compatible with baseline.`)
    process.exit(0)
  }

  console.error('✗ SDK API compatibility FAILED — breaking changes detected:\n')
  for (const v of breakingViolations) {
    console.error(`  [BREAKING] ${v.location}: ${v.message}`)
  }
  console.error(`\n${breakingViolations.length} breaking change(s). Update baseline or revert.`)
  process.exit(1)
}

run()
