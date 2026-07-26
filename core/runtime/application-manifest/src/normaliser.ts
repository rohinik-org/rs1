import type { CapabilityConstraint } from '@rohinik-org/capability-contracts-ir'
import type { SourceDoc } from './structural.js'

export interface CapabilityProjection {
  readonly capabilityId: string
  readonly versionRange: string
  readonly necessity: 'required' | 'optional'
  readonly multiplicity: string
  readonly constraints: readonly CapabilityConstraint[]
}

export interface SemanticProjection {
  readonly schemaVersion: string
  readonly application: { readonly id: string; readonly name: string; readonly version: string }
  readonly runtime: { readonly language: string; readonly languageVersion?: string; readonly entrypoint?: string }
  readonly capabilities: {
    readonly required: readonly CapabilityProjection[]
    readonly optional: readonly CapabilityProjection[]
  }
  readonly dependencyManagementMode: string
  readonly resolution: { readonly allowMarketplace: boolean; readonly allowExternalRegistries: boolean; readonly allowLocalPackages: boolean }
  readonly degradation: { readonly allowOptionalCapabilityFailure: boolean }
}

// allCompiledConstraints: flat array — indices match [required[0..n], optional[0..m]]
export function buildSemanticProjection(
  doc: SourceDoc,
  allCompiledConstraints: readonly (readonly CapabilityConstraint[])[],
): SemanticProjection {
  function projectDecl(
    decl: { id: string; version: string; multiplicity?: string },
    necessity: 'required' | 'optional',
    constraints: readonly CapabilityConstraint[],
  ): CapabilityProjection {
    return {
      capabilityId: decl.id,
      versionRange: decl.version,
      necessity,
      multiplicity: decl.multiplicity ?? 'single',
      constraints,
    }
  }

  const requiredProjections = doc.capabilitiesRequired.map((d, i) =>
    projectDecl(d, 'required', allCompiledConstraints[i] ?? []),
  )
  const optionalProjections = doc.capabilitiesOptional.map((d, i) =>
    projectDecl(d, 'optional', allCompiledConstraints[doc.capabilitiesRequired.length + i] ?? []),
  )

  return {
    schemaVersion: doc.schemaVersion,
    application: { id: doc.application.id, name: doc.application.name, version: doc.application.version },
    runtime: {
      language: doc.runtime.language,
      ...(doc.runtime.languageVersion !== undefined ? { languageVersion: doc.runtime.languageVersion } : {}),
      ...(doc.runtime.entrypoint !== undefined ? { entrypoint: doc.runtime.entrypoint } : {}),
    },
    capabilities: { required: requiredProjections, optional: optionalProjections },
    dependencyManagementMode: doc.dependencyManagementMode,
    resolution: { ...doc.resolution },
    degradation: { ...doc.degradation },
  }
}
