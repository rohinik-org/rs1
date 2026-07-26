import { parse } from '@typescript-eslint/typescript-estree'
import { CAPABILITY_ID_PATTERN } from '@rohinik-org/capability-ir'
import type { ManifestDiagnosticCode } from '@rohinik-org/application-manifest-ir'

const SDK_MODULE_SPECIFIER = '@rohinik-org/sdk'
const CAPABILITY_EXPORT_NAME = 'capability'

export interface CapabilityUsageObservation {
  readonly capabilityId: string
  readonly sourcePath: string
  readonly line: number
  readonly column: number
  readonly isDynamic: false
}

export interface IndeterminateCapabilityUsage {
  readonly sourcePath: string
  readonly line: number
  readonly column: number
  readonly reason: 'dynamic-expression'
}

export interface ScanParseFailure {
  readonly code: ManifestDiagnosticCode
  readonly message: string
}

export interface InvalidLiteralUsage {
  readonly sourcePath: string
  readonly literal: string
  readonly line: number
  readonly column: number
}

export interface ScanResult {
  readonly sourcePath: string
  readonly usages: readonly CapabilityUsageObservation[]
  readonly indeterminateUsages: readonly IndeterminateCapabilityUsage[]
  readonly invalidLiteralUsages: readonly InvalidLiteralUsage[]
  readonly parseFailure?: ScanParseFailure
}

export function scanSource(source: string, sourcePath: string): ScanResult {
  let ast: ReturnType<typeof parse>
  try {
    const jsx = sourcePath.endsWith('.tsx') || sourcePath.endsWith('.jsx')
    ast = parse(source, { loc: true, range: false, jsx, errorOnUnknownASTType: false })
  } catch (e) {
    return {
      sourcePath,
      usages: [],
      indeterminateUsages: [],
      invalidLiteralUsages: [],
      parseFailure: {
        code: 'SOURCE_SCAN_PARSE_FAILED',
        message: `Failed to parse ${sourcePath}: ${String(e)}`,
      },
    }
  }

  // Collect local names bound to @rohinik-org/sdk's 'capability' export
  const sdkLocalNames = new Set<string>()

  for (const node of ast.body) {
    if (
      node.type === 'ImportDeclaration' &&
      node.source.value === SDK_MODULE_SPECIFIER
    ) {
      for (const specifier of node.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          (
            (specifier.imported.type === 'Identifier' && specifier.imported.name === CAPABILITY_EXPORT_NAME) ||
            (specifier.imported.type === 'Literal' && specifier.imported.value === CAPABILITY_EXPORT_NAME)
          )
        ) {
          sdkLocalNames.add(specifier.local.name)
        }
      }
    }
  }

  if (sdkLocalNames.size === 0) {
    return { sourcePath, usages: [], indeterminateUsages: [], invalidLiteralUsages: [] }
  }

  const usages: CapabilityUsageObservation[] = []
  const indeterminateUsages: IndeterminateCapabilityUsage[] = []
  const invalidLiteralUsages: InvalidLiteralUsage[] = []

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>

    if (
      n['type'] === 'CallExpression' &&
      (n['callee'] as Record<string, unknown>)?.['type'] === 'Identifier' &&
      sdkLocalNames.has((n['callee'] as Record<string, unknown>)?.['name'] as string)
    ) {
      const args = n['arguments'] as unknown[]
      const firstArg = args[0] as Record<string, unknown> | undefined
      const loc = (n['loc'] as Record<string, unknown> | undefined)?.['start'] as Record<string, unknown> | undefined
      const line = Number(loc?.['line'] ?? 0)
      const column = Number(loc?.['column'] ?? 0)

      if (firstArg?.['type'] === 'Literal' && typeof firstArg['value'] === 'string') {
        const capId = firstArg['value']
        if (CAPABILITY_ID_PATTERN.test(capId)) {
          usages.push({ capabilityId: capId, sourcePath, line, column, isDynamic: false })
        } else {
          invalidLiteralUsages.push({ sourcePath, literal: capId, line, column })
        }
      } else {
        indeterminateUsages.push({ sourcePath, line, column, reason: 'dynamic-expression' })
      }
    }

    for (const key of Object.keys(n)) {
      const child = n[key]
      if (Array.isArray(child)) child.forEach(walk)
      else if (child && typeof child === 'object' && 'type' in (child as object)) walk(child)
    }
  }

  walk(ast)
  return { sourcePath, usages, indeterminateUsages, invalidLiteralUsages }
}
