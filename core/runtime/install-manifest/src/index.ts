export type {
  InstallManifest,
  ReleaseChannel,
  PlatformDescriptor,
  ProtocolVersions,
  BundleIntegrity,
  ConfigContract,
  MinimumRequirements,
  CliCompatibility,
} from './manifest.js'
export { MANIFEST_SCHEMA_VERSION } from './manifest.js'

export type { RohinikHome } from './home.js'
export { resolveHome, manifestPath, runtimeEntrypoint } from './home.js'

export type { ManifestValidationResult } from './validate.js'
export { validateManifest, checkCliCompatibility } from './validate.js'
