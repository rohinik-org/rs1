import type {
  SecretDeclaration,
  EnvironmentVariableDeclaration,
  ConfigurationDeclarations,
} from '@rohinik-org/package-manifest-ir'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfigurationDefinition {
  readonly secrets: readonly SecretDeclaration[]
  readonly environment: readonly EnvironmentVariableDeclaration[]
}

// ─── declareConfiguration ─────────────────────────────────────────────────────

export function declareConfiguration(input: ConfigurationDeclarations): ConfigurationDefinition {
  const secrets = input.secrets ?? []
  const environment = input.environment ?? []

  for (const secret of secrets) {
    if (!secret.name) {
      throw Object.assign(new Error('invalid-input: secret name is required'), { code: 'invalid-input' as const })
    }
    // L-9K-004: secrets must never carry defaults — guard duck-typed input via unknown cast
    if ('default' in (secret as unknown as Record<string, unknown>)) {
      throw Object.assign(
        new Error(`invalid-input: secret "${secret.name}" must not have a default value`),
        { code: 'invalid-input' as const },
      )
    }
  }

  for (const env of environment) {
    if (!env.name) {
      throw Object.assign(new Error('invalid-input: environment variable name is required'), {
        code: 'invalid-input' as const,
      })
    }
  }

  return Object.freeze({
    secrets: Object.freeze([...secrets].map((s) => Object.freeze({ ...s }))),
    environment: Object.freeze([...environment].map((e) => Object.freeze({ ...e }))),
  })
}
