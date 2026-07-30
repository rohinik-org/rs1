export { parsePackageManifest } from './manifest-parser.js'

// Re-export IR types consumers need
export type {
  RohinikPackageManifestV1,
  PackageManifestErrorCode,
  ManifestValidationIssue,
  PackageManifestParseResult,
} from '@rohinik-org/package-manifest-ir'
