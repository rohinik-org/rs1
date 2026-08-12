/**
 * Frozen install manifest schema for Rohinik runtime distributions.
 *
 * A manifest file (rohinik-manifest.json) is written alongside every runtime
 * bundle. The CLI reads it before activation and rejects incompatible versions.
 *
 * Constitutional rule: the manifest describes exactly what was installed.
 * The CLI verifies it; the runtime trusts it.
 */

export const MANIFEST_SCHEMA_VERSION = '1' as const

/** Supported release channels. */
export type ReleaseChannel = 'stable' | 'beta' | 'nightly'

/** Supported OS/arch combinations for the runtime binary. */
export interface PlatformDescriptor {
  os: 'linux' | 'darwin' | 'win32'
  arch: 'x64' | 'arm64'
}

/**
 * Protocol version map frozen at release time.
 * Keys must match the protocol names used in Stage 16A–16E.
 */
export interface ProtocolVersions {
  execution: string
  agent: string
  control: string
}

/** Integrity record for the runtime bundle artifact. */
export interface BundleIntegrity {
  algorithm: 'sha256'
  /** Hex-encoded hash of the distribution tarball/zip before extraction. */
  artifactHash: string
}

/** Config schema contract bundled with this runtime version. */
export interface ConfigContract {
  /** Version of the rohinik.yaml schema supported by this runtime. */
  schemaVersion: string
  /** Default config filename the CLI will create on first install. */
  defaultFile: string
}

/** Minimum platform requirements to run this runtime. */
export interface MinimumRequirements {
  /** Semver range string, e.g. ">=22.0.0". */
  node: string
}

/**
 * CLI ↔ runtime compatibility contract.
 *
 * The CLI checks its own version against these ranges before activation.
 * If the CLI version is outside [minCliVersion, maxCliVersion], it must
 * refuse to start and print a human-readable upgrade message.
 */
export interface CliCompatibility {
  /** Minimum CLI version that can drive this runtime (inclusive). Semver. */
  minCliVersion: string
  /** Maximum CLI version this runtime was tested against (inclusive). Semver. May be absent for open-ended. */
  maxCliVersion?: string
}

/** Signing policy enforced by the CLI at install time. */
export type SigningPolicy = 'required' | 'warn'

/** Provenance record linking the installed artifact back to its source commit. */
export interface ArtifactProvenance {
  version:        string   // runtimeVersion
  gitTag:         string
  sourceCommit:   string
  sourceRepo:     string
  /** sha256 hex hash of the release-provenance-<version>.json document. */
  provenanceHash: string
}

/**
 * The frozen install manifest.
 *
 * Written to ROHINIK_HOME/runtimes/<version>/rohinik-manifest.json at install
 * time. Never modified after write — upgrades install a new version directory.
 */
export interface InstallManifest {
  /** Always "1". Bump only if the shape of this interface changes incompatibly. */
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION
  /** Semver string, e.g. "0.16.0-beta.1". */
  runtimeVersion: string
  releaseChannel: ReleaseChannel
  platform: PlatformDescriptor
  /**
   * Path to the runtime entrypoint script, relative to the version directory.
   * Canonical value: "bin/rhks.js"
   *
   * Note: @rohinik-org/daemon (rhkd) is a separate Stage 6 IPC process manager
   * and is NOT this entrypoint. rhks is the sole HTTP runtime entrypoint.
   */
  entrypoint: string
  protocols: ProtocolVersions
  integrity: BundleIntegrity
  config: ConfigContract
  minimumRequirements: MinimumRequirements
  cliCompatibility: CliCompatibility
  /** ISO-8601 timestamp when this manifest was written. */
  installedAt: string
  /**
   * Flat list of public npm packages bundled inside this runtime distribution.
   * These are the packages the CLI should treat as "provided by runtime" and
   * not re-install from the registry.
   */
  includedPackages: readonly string[]
  /**
   * Signing policy for this artifact. If 'required', CLI refuses to install
   * if signature is missing, unknown-key, or invalid. If 'warn', CLI installs
   * with a visible warning. Absent = no signing check (backwards compat).
   */
  signingPolicy?: SigningPolicy
  /** Source provenance record. Present on officially-signed builds. */
  provenance?: ArtifactProvenance
}
