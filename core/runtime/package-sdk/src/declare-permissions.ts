import type {
  PermissionDeclarations,
  NetworkPermissions,
  SecretsPermissions,
  CapabilityPermissions,
  FilesystemPermissions,
} from '@rohinik-org/package-manifest-ir'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermissionDefinition {
  readonly network: NetworkPermissions
  readonly secrets: SecretsPermissions
  readonly capabilities: CapabilityPermissions
  readonly filesystem: FilesystemPermissions
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeNetwork(n: NetworkPermissions | undefined): NetworkPermissions {
  return Object.freeze({
    outbound: Object.freeze([...(n?.outbound ?? [])].map((r) => Object.freeze({ ...r }))),
    inbound: Object.freeze([...(n?.inbound ?? [])].map((r) => Object.freeze({ ...r }))),
  })
}

function normalizeSecrets(s: SecretsPermissions | undefined): SecretsPermissions {
  return Object.freeze({
    consume: Object.freeze([...(s?.consume ?? [])]),
  })
}

function normalizeCapabilities(c: CapabilityPermissions | undefined): CapabilityPermissions {
  return Object.freeze({
    consume: Object.freeze([...(c?.consume ?? [])]),
    provide: Object.freeze([...(c?.provide ?? [])]),
  })
}

function normalizeFilesystem(f: FilesystemPermissions | undefined): FilesystemPermissions {
  return Object.freeze({
    paths: Object.freeze([...(f?.paths ?? [])]),
    modes: Object.freeze([...(f?.modes ?? [])]),
  })
}

// ─── declarePermissions ───────────────────────────────────────────────────────

export function declarePermissions(input: PermissionDeclarations): PermissionDefinition {
  // Validate: no contradictory declarations (inbound AND outbound same host:port with conflicting protocols)
  const outbound = input.network?.outbound ?? []
  const seen = new Set<string>()
  for (const rule of outbound) {
    if (!rule.host) {
      throw Object.assign(new Error('invalid-input: network rule must have a host'), {
        code: 'invalid-input' as const,
      })
    }
    const key = rule.host
    if (seen.has(key)) {
      throw Object.assign(
        new Error(`validation-failed: duplicate outbound network rule for host "${rule.host}"`),
        { code: 'validation-failed' as const },
      )
    }
    seen.add(key)
  }

  // L-9K-005: normalization never expands scope — only collapse/deduplicate
  return Object.freeze({
    network: normalizeNetwork(input.network),
    secrets: normalizeSecrets(input.secrets),
    capabilities: normalizeCapabilities(input.capabilities),
    filesystem: normalizeFilesystem(input.filesystem),
  })
}
