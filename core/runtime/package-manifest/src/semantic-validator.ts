import {
  PACKAGE_ID_PATTERN,
  CAPABILITY_ID_PATTERN,
} from '@rohinik-org/package-manifest-ir'
import type { ManifestValidationIssue, RohinikPackageType, PublisherCertification } from '@rohinik-org/package-manifest-ir'
import type { StructuredDoc } from './structural-validator.js'

const VALID_PACKAGE_TYPES = new Set<string>([
  'capability-provider', 'capability-composite', 'adapter',
  'infrastructure-provider', 'model-provider', 'developer-tooling',
] satisfies RohinikPackageType[])

const VALID_CERTIFICATIONS = new Set<string>([
  'official', 'verified', 'compatible', 'none',
] satisfies PublisherCertification[])

// Simple semver: major.minor.patch, optional pre-release/build metadata
const SEMVER_PATTERN = /^\d+\.\d+\.\d+/

function issue(path: string, message: string): ManifestValidationIssue {
  return { severity: 'error', code: 'validation-failed', message, path }
}

export function validateSemantics(doc: StructuredDoc): readonly ManifestValidationIssue[] {
  const issues: ManifestValidationIssue[] = []

  // package.id
  if (!PACKAGE_ID_PATTERN.test(doc.package.id)) {
    issues.push(issue('package.id', `package.id must be reverse-domain format (e.g. com.example.my-package), got: '${doc.package.id}'`))
  }

  // package.version
  if (!SEMVER_PATTERN.test(doc.package.version)) {
    issues.push(issue('package.version', `package.version must be valid semver, got: '${doc.package.version}'`))
  }

  // package.type
  if (!VALID_PACKAGE_TYPES.has(doc.package.type)) {
    issues.push(issue('package.type', `package.type must be one of: ${[...VALID_PACKAGE_TYPES].join(', ')}, got: '${doc.package.type}'`))
  }

  // publisher.id and publisher.certification
  if (doc.publisher) {
    if (!PACKAGE_ID_PATTERN.test(doc.publisher.id)) {
      issues.push(issue('publisher.id', `publisher.id must be reverse-domain format, got: '${doc.publisher.id}'`))
    }
    if (!VALID_CERTIFICATIONS.has(doc.publisher.certification)) {
      issues.push(issue('publisher.certification', `publisher.certification must be one of: ${[...VALID_CERTIFICATIONS].join(', ')}, got: '${doc.publisher.certification}'`))
    }
  }

  // runtime.entrypoint path traversal
  if (doc.runtime?.entrypoint !== undefined) {
    const ep = doc.runtime.entrypoint
    if (ep.startsWith('/')) {
      issues.push(issue('runtime.entrypoint', `runtime.entrypoint must not be absolute, got: '${ep}'`))
    }
    if (ep.includes('..')) {
      issues.push(issue('runtime.entrypoint', `runtime.entrypoint must not contain '..', got: '${ep}'`))
    }
  }

  // provides: capability ID validity + duplicate detection
  if (doc.provides) {
    const seen = new Set<string>()
    for (let i = 0; i < doc.provides.length; i++) {
      const cap = doc.provides[i]!
      if (!CAPABILITY_ID_PATTERN.test(cap.capability)) {
        issues.push(issue(`provides[${i}].capability`, `Invalid capability ID '${cap.capability}'`))
      }
      if (!SEMVER_PATTERN.test(cap.version)) {
        issues.push(issue(`provides[${i}].version`, `provides[${i}].version must be valid semver, got: '${cap.version}'`))
      }
      if (seen.has(cap.capability)) {
        issues.push(issue(`provides[${i}].capability`, `Duplicate provided capability '${cap.capability}'`))
      } else {
        seen.add(cap.capability)
      }
    }
  }

  // dependencies.npm: duplicate name detection
  if (doc.dependencies?.npm) {
    const seen = new Set<string>()
    for (let i = 0; i < doc.dependencies.npm.length; i++) {
      const dep = doc.dependencies.npm[i]!
      if (seen.has(dep.name)) {
        issues.push(issue(`dependencies.npm[${i}].name`, `Duplicate npm dependency '${dep.name}'`))
      } else {
        seen.add(dep.name)
      }
    }
  }

  return issues
}
