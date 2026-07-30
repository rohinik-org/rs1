import type { NpmDependencyDeclaration } from '@rohinik-org/package-manifest-ir'
import { CAPABILITY_ID_PATTERN, PACKAGE_ID_PATTERN } from '@rohinik-org/package-manifest-ir'

// ─── SDK-only dependency types ────────────────────────────────────────────────

export interface LanguageDependencyDeclaration {
  readonly language: string
  readonly versionRange: string
}

export interface ModelDependencyDeclaration {
  readonly modelId: string
  readonly versionRange?: string
}

export interface InfrastructureDependencyDeclaration {
  readonly kind: string
  readonly versionRange?: string
}

export interface DependencyDefinition {
  readonly rohinik: readonly string[]
  readonly npm: readonly NpmDependencyDeclaration[]
  readonly language: readonly LanguageDependencyDeclaration[]
  readonly model: readonly ModelDependencyDeclaration[]
  readonly infrastructure: readonly InfrastructureDependencyDeclaration[]
}

export interface DeclareDependenciesInput {
  readonly rohinik?: readonly string[]
  readonly npm?: readonly NpmDependencyDeclaration[]
  readonly language?: readonly LanguageDependencyDeclaration[]
  readonly model?: readonly ModelDependencyDeclaration[]
  readonly infrastructure?: readonly InfrastructureDependencyDeclaration[]
}

// ─── declareDependencies ──────────────────────────────────────────────────────

export function declareDependencies(input: DeclareDependenciesInput): DependencyDefinition {
  const rohinik = input.rohinik ?? []
  const npm = input.npm ?? []

  for (const pkgId of rohinik) {
    if (!PACKAGE_ID_PATTERN.test(pkgId)) {
      throw Object.assign(
        new Error(`invalid-input: rohinik dependency id "${pkgId}" does not match required pattern`),
        { code: 'invalid-input' as const },
      )
    }
  }

  for (const dep of npm) {
    if (!dep.name) {
      throw Object.assign(new Error('invalid-input: npm dependency name is required'), {
        code: 'invalid-input' as const,
      })
    }
    if (!dep.version) {
      throw Object.assign(new Error(`invalid-input: npm dependency "${dep.name}" version is required`), {
        code: 'invalid-input' as const,
      })
    }
  }

  for (const lang of input.language ?? []) {
    if (!lang.language) {
      throw Object.assign(new Error('invalid-input: language dependency language is required'), {
        code: 'invalid-input' as const,
      })
    }
    if (!lang.versionRange) {
      throw Object.assign(new Error(`invalid-input: language dependency "${lang.language}" versionRange is required`), {
        code: 'invalid-input' as const,
      })
    }
  }

  for (const model of input.model ?? []) {
    if (!model.modelId) {
      throw Object.assign(new Error('invalid-input: model dependency modelId is required'), {
        code: 'invalid-input' as const,
      })
    }
  }

  for (const infra of input.infrastructure ?? []) {
    if (!infra.kind) {
      throw Object.assign(new Error('invalid-input: infrastructure dependency kind is required'), {
        code: 'invalid-input' as const,
      })
    }
  }

  return Object.freeze({
    rohinik: Object.freeze([...rohinik]),
    npm: Object.freeze([...npm].map((d) => Object.freeze({ ...d }))),
    language: Object.freeze([...(input.language ?? [])].map((d) => Object.freeze({ ...d }))),
    model: Object.freeze([...(input.model ?? [])].map((d) => Object.freeze({ ...d }))),
    infrastructure: Object.freeze([...(input.infrastructure ?? [])].map((d) => Object.freeze({ ...d }))),
  })
}
