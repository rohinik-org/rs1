import type {
  ApplicationManifest,
  CapabilityDeclarationMap,
  CapabilityDeclarationMapEntry,
  ApplicationManifestDiagnostic,
} from '@rohinik-org/application-manifest-ir'
import type {
  CapabilityRequirementBuilder,
  CapabilityRequirementSet,
  CapabilityRequirementSetDraft,
} from '@rohinik-org/capability-contracts-ir'
import { toApplicationId } from '@rohinik-org/capability-ir'

export type ManifestCompilationResult =
  | {
      readonly status: 'compiled'
      readonly manifest: ApplicationManifest
      readonly requirementSet: CapabilityRequirementSet
      readonly declarationMap: CapabilityDeclarationMap
      readonly diagnostics: readonly ApplicationManifestDiagnostic[]
    }
  | {
      readonly status: 'invalid'
      readonly diagnostics: readonly ApplicationManifestDiagnostic[]
    }

export interface ManifestCompilerOptions {
  readonly requirementBuilder: CapabilityRequirementBuilder
}

export interface ApplicationManifestCompiler {
  compile(manifest: ApplicationManifest): ManifestCompilationResult
}

export function createManifestCompiler(opts: ManifestCompilerOptions): ApplicationManifestCompiler {
  return { compile: (manifest) => compile(manifest, opts.requirementBuilder) }
}

function compile(
  manifest: ApplicationManifest,
  builder: CapabilityRequirementBuilder,
): ManifestCompilationResult {
  const applicationId = toApplicationId(manifest.application.id)

  const allDeclarations = [
    ...manifest.capabilities.required,
    ...manifest.capabilities.optional,
  ]

  const draft: CapabilityRequirementSetDraft = {
    applicationId: manifest.application.id,
    requirements: allDeclarations.map(decl => ({
      capabilityId: decl.capabilityId,
      versionRange: decl.versionRange,
      necessity: decl.necessity,
      multiplicity: decl.multiplicity,
      // ponytail: typed spread avoids unsafe cast; constraints[] is readonly CapabilityConstraint[]
      constraints: [...decl.constraints],
      requestedBy: {
        direct: { kind: 'application' as const, applicationId },
        chain: [] as const,
      },
    })),
  }

  const prepResult = builder.prepare(draft)
  if (prepResult.status !== 'ok') {
    const errors = prepResult.validation.errors
    return {
      status: 'invalid',
      diagnostics: errors.length > 0
        ? errors.map(e => ({
            code: 'REQUIREMENT_COMPILATION_FAILED' as const,
            severity: 'error' as const,
            message: e.message,
            path: e.path,
          }))
        : [{
            code: 'REQUIREMENT_COMPILATION_FAILED' as const,
            severity: 'error' as const,
            message: 'Stage 9E-2 builder rejected the requirement set draft',
          }],
    }
  }

  const matResult = builder.materialize(prepResult.prepared)
  const requirementSet = matResult.interned.set

  const declarationMap: CapabilityDeclarationMapEntry[] = allDeclarations.map((decl, i) => {
    const req = requirementSet.requirements.find(r => r.capabilityId === decl.capabilityId)
    const isRequired = i < manifest.capabilities.required.length
    return Object.freeze({
      requirementId: req?.requirementId ?? '',
      capabilityId: decl.capabilityId,
      declarationPath: decl.declarationPath,
      declarationIndex: isRequired ? i : i - manifest.capabilities.required.length,
      necessity: decl.necessity,
    })
  })

  return {
    status: 'compiled',
    manifest,
    requirementSet,
    declarationMap: Object.freeze(declarationMap),
    diagnostics: [],
  }
}
