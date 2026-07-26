import { deepFreeze } from './deep-freeze.js'
import { toApplicationId, toCapabilityId } from '@rohinik-org/capability-ir'
import type {
  ApplicationManifest,
  ApplicationManifestSourceHash,
  ApplicationManifestSemanticHash,
  ManifestCapabilityDeclaration,
  CapabilityDeclarationPath,
} from '@rohinik-org/application-manifest-ir'
import { MANIFEST_SCHEMA_VERSION } from '@rohinik-org/application-manifest-ir'
import type { CapabilityConstraint } from '@rohinik-org/capability-contracts-ir'
import type { SourceDoc } from './structural.js'

export function assembleManifest(
  doc: SourceDoc,
  allCompiledConstraints: readonly (readonly CapabilityConstraint[])[],
  sourceHash: ApplicationManifestSourceHash,
  semanticHash: ApplicationManifestSemanticHash,
): ApplicationManifest {
  function buildDecl(
    raw: { id: string; version: string; multiplicity?: string },
    necessity: 'required' | 'optional',
    constraints: readonly CapabilityConstraint[],
    path: string,
  ): ManifestCapabilityDeclaration {
    return {
      capabilityId: toCapabilityId(raw.id),
      versionRange: raw.version,
      necessity,
      multiplicity: (raw.multiplicity ?? 'single') as 'single' | 'one-or-more' | 'all-compatible',
      constraints,
      declarationPath: path as CapabilityDeclarationPath,
    }
  }

  const required: ManifestCapabilityDeclaration[] = doc.capabilitiesRequired.map((d, i) =>
    buildDecl(d, 'required', allCompiledConstraints[i] ?? [], `capabilities.required[${i}]`),
  )
  const optional: ManifestCapabilityDeclaration[] = doc.capabilitiesOptional.map((d, i) =>
    buildDecl(d, 'optional', allCompiledConstraints[doc.capabilitiesRequired.length + i] ?? [], `capabilities.optional[${i}]`),
  )

  const manifest: ApplicationManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    application: {
      id: toApplicationId(doc.application.id),
      name: doc.application.name,
      version: doc.application.version,
    },
    runtime: {
      language: doc.runtime.language,
      ...(doc.runtime.languageVersion !== undefined ? { languageVersion: doc.runtime.languageVersion } : {}),
      ...(doc.runtime.entrypoint !== undefined ? { entrypoint: doc.runtime.entrypoint } : {}),
    },
    capabilities: {
      required,
      optional,
    },
    dependencyManagement: { mode: doc.dependencyManagementMode as 'managed' | 'observed' | 'immutable' },
    resolution: { ...doc.resolution },
    degradation: { ...doc.degradation },
    sourceHash,
    semanticHash,
  }

  return deepFreeze(manifest)
}
