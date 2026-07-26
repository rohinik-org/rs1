import type {
  ApplicationManifestParser,
  ApplicationManifestParseResult,
  ApplicationManifestDiagnostic,
} from '@rohinik-org/application-manifest-ir'
import { decodeManifestYaml } from './decoder.js'
import { validateStructure } from './structural.js'
import { validateSemantics } from './semantic.js'
import { compileConstraints } from './constraint-compiler.js'
import { detectContradictions } from './contradiction.js'
import { buildSemanticProjection } from './normaliser.js'
import { computeSourceHash, computeSemanticHash } from './hasher.js'
import { assembleManifest } from './assembler.js'
import type { CapabilityConstraint } from '@rohinik-org/capability-contracts-ir'

export function createManifestParser(): ApplicationManifestParser {
  return { parse }
}

function parse(yamlSource: string): ApplicationManifestParseResult {
  // 1. Decode YAML — restricted JSON_SCHEMA, no type coercions
  const decodeResult = decodeManifestYaml(yamlSource)
  if (decodeResult.status === 'error') {
    return { status: 'invalid', diagnostics: [decodeResult.diagnostic] }
  }

  // 2. Structural validation — unknown-field rejection, type checks
  const structResult = validateStructure(decodeResult.doc)
  if (structResult.status === 'error') {
    return { status: 'invalid', diagnostics: structResult.diagnostics }
  }
  const sourcedoc = structResult.doc

  // 3. Semantic validation — IDs, semver, cross-list duplicates
  const semDiag = validateSemantics(sourcedoc)
  if (semDiag.some(d => d.severity === 'error')) {
    return { status: 'invalid', diagnostics: semDiag }
  }

  // 4. Compile constraints + detect contradictions per declaration
  const allCompiledConstraints: CapabilityConstraint[][] = []
  const constraintDiag: ApplicationManifestDiagnostic[] = []

  const allDecls = [
    ...sourcedoc.capabilitiesRequired.map((d, i) => ({ decl: d, path: `capabilities.required[${i}]` })),
    ...sourcedoc.capabilitiesOptional.map((d, i) => ({ decl: d, path: `capabilities.optional[${i}]` })),
  ]

  for (const { decl, path } of allDecls) {
    const { constraints, diagnostics } = compileConstraints(decl.constraints, path)
    constraintDiag.push(...diagnostics)
    const contradictions = detectContradictions(constraints, path)
    constraintDiag.push(...contradictions)
    allCompiledConstraints.push([...constraints])
  }

  if (constraintDiag.some(d => d.severity === 'error')) {
    return { status: 'invalid', diagnostics: constraintDiag }
  }

  // 5. Build semantic projection from validated+normalised data only
  const projection = buildSemanticProjection(sourcedoc, allCompiledConstraints)

  // 6. Hash: sourceHash over raw bytes; semanticHash over canonical projection
  const sourceHash = computeSourceHash(yamlSource)
  const semanticHash = computeSemanticHash(projection)

  // 7. Assemble deep-frozen manifest
  const manifest = assembleManifest(sourcedoc, allCompiledConstraints, sourceHash, semanticHash)

  const allDiag: ApplicationManifestDiagnostic[] = [...semDiag, ...constraintDiag]
  return { status: 'valid', manifest, diagnostics: allDiag }
}
