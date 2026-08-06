/**
 * generate-sdk-api-baseline.ts
 *
 * Reads SDK source at the path given by --sdk-root (or ROHINIK_SDK_ROOT env).
 * Extracts exported symbols with normalized signatures using the TypeScript
 * compiler API. Writes docs/compat/sdk-api-baseline.json.
 *
 * Run: npx tsx scripts/generate-sdk-api-baseline.ts --sdk-root <path-to-sdk>
 *
 * Requires: typescript (already a dev dep in the workspace root or per-package)
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const OUT_FILE = resolve(REPO_ROOT, 'docs/compat/sdk-api-baseline.json')

function parseArgs(): { sdkRoot: string } {
  const idx = process.argv.indexOf('--sdk-root')
  const sdkRoot = idx !== -1 ? process.argv[idx + 1] : process.env['ROHINIK_SDK_ROOT']
  if (!sdkRoot) {
    console.error('Usage: generate-sdk-api-baseline.ts --sdk-root <path-to-sdk-repo>')
    console.error('  or set ROHINIK_SDK_ROOT env var')
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

function normalizeTypeText(t: string): string {
  return t.replace(/\s+/g, ' ').trim()
}

function getTypeText(typeNode: ts.TypeNode | undefined, checker: ts.TypeChecker, node: ts.Node): string {
  if (!typeNode) return 'unknown'
  return normalizeTypeText(typeNode.getText(node.getSourceFile()))
}

function run(): void {
  const { sdkRoot } = parseArgs()
  const indexPath = resolve(sdkRoot, 'packages/client/src/index.ts')
  const tsconfigPath = resolve(sdkRoot, 'packages/client/tsconfig.json')

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, resolve(sdkRoot, 'packages/client'))

  const program = ts.createProgram({
    rootNames: [indexPath],
    options: parsedConfig.options,
  })
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

      // Resolve to the original declaration
      const sym = checker.getExportSpecifierLocalTargetSymbol(el)
      if (!sym) {
        exports.push({ name, kind: 'unknown', typeOnly: elTypeOnly })
        continue
      }

      const decls = sym.getDeclarations() ?? []
      const decl = decls[0]

      if (!decl) {
        exports.push({ name, kind: 'unknown', typeOnly: elTypeOnly })
        continue
      }

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

        // Constructor
        const ctorDecl = decl.members.find(ts.isConstructorDeclaration)
        if (ctorDecl) {
          const params = ctorDecl.parameters.map(p => {
            const optional = p.questionToken !== undefined || p.initializer !== undefined ? '?' : ''
            const typeStr = p.type ? normalizeTypeText(p.type.getText(decl.getSourceFile())) : 'unknown'
            return `${p.name.getText(decl.getSourceFile())}${optional}: ${typeStr}`
          })
          entry.constructor = `(${params.join(', ')})`
        }

        // Heritage (extends)
        if (decl.heritageClauses) {
          for (const hc of decl.heritageClauses) {
            if (hc.token === ts.SyntaxKind.ExtendsKeyword) {
              entry.extendsClass = hc.types[0]?.expression.getText(decl.getSourceFile())
            }
          }
        }

        // Public members
        const members: ExportEntry['publicMembers'] = []
        for (const member of decl.members) {
          const isPrivate = member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)
          const isProtected = member.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword)
          if (isPrivate || isProtected) continue
          if (ts.isConstructorDeclaration(member)) continue

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
        const members: ExportEntry['members'] = []
        for (const member of decl.members) {
          if (ts.isPropertySignature(member) && member.name) {
            const mName = member.name.getText(decl.getSourceFile())
            const optional = member.questionToken !== undefined
            const typeStr = member.type ? normalizeTypeText(member.type.getText(decl.getSourceFile())) : 'unknown'
            members.push({ name: mName, optional, type: typeStr })
          }
        }
        const entry: ExportEntry = { name, kind: 'interface', typeOnly: true }
        if (members.length) entry.members = members
        exports.push(entry)

      } else if (ts.isTypeAliasDeclaration(decl)) {
        exports.push({ name, kind: 'type', typeOnly: true })

      } else if (ts.isVariableDeclaration(decl)) {
        const type = checker.getTypeOfSymbolAtLocation(sym, decl)
        const typeStr = checker.typeToString(type)
        const entry: ExportEntry = { name, kind: 'const', typeOnly: false, type: normalizeTypeText(typeStr) }
        // Capture literal value for constants
        if (type.isStringLiteral()) entry.value = type.value
        exports.push(entry)

      } else {
        exports.push({ name, kind: 'unknown', typeOnly: elTypeOnly })
      }
    }
  }

  const baseline = {
    baselineTag: 'v0.16.0-stage16a',
    generatedAt: new Date().toISOString(),
    packageName: '@rohinik-org/client',
    packageVersion: '1.0.0',
    compatibilityPolicy: {
      breaking: [
        'removed or renamed runtime export',
        'runtime signature incompatibility (parameter removed, required parameter added, parameter type narrowed)',
        'removed public class member',
        'return type narrowed in a way that breaks consumers',
      ],
      compatible: [
        'new exports',
        'new optional parameters',
        'new optional fields on option objects',
        'compatible overloads',
        'type-only export additions',
      ],
    },
    exports,
  }

  writeFileSync(OUT_FILE, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`SDK API baseline written: ${OUT_FILE}`)
  console.log(`  ${exports.length} exports recorded`)
}

run()
