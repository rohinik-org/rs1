import { valid as semverValid, validRange as semverValidRange } from 'semver'
import { CAPABILITY_ID_PATTERN } from '@rohinik-org/capability-ir'
import type { ApplicationManifestDiagnostic } from '@rohinik-org/application-manifest-ir'
import { APPLICATION_ID_PATTERN } from '@rohinik-org/application-manifest-ir'
import type { SourceDoc } from './structural.js'

const VALID_MULTIPLICITIES = new Set(['single', 'one-or-more', 'all-compatible'])

export function validateSemantics(doc: SourceDoc): readonly ApplicationManifestDiagnostic[] {
  const diag: ApplicationManifestDiagnostic[] = []

  if (!APPLICATION_ID_PATTERN.test(doc.application.id)) {
    diag.push({ code: 'INVALID_APPLICATION_ID', severity: 'error', message: `application.id must be reverse-domain format (e.g. com.example.app), got: '${doc.application.id}'`, path: 'application.id' })
  }

  if (!semverValid(doc.application.version)) {
    diag.push({ code: 'INVALID_APPLICATION_VERSION', severity: 'error', message: `application.version must be valid semver, got: '${doc.application.version}'`, path: 'application.version' })
  }

  const seenCapabilityIds = new Set<string>()

  for (const [list, listPath] of [
    [doc.capabilitiesRequired, 'capabilities.required'],
    [doc.capabilitiesOptional, 'capabilities.optional'],
  ] as const) {
    for (let i = 0; i < list.length; i++) {
      const decl = list[i]!
      const path = `${listPath}[${i}]`

      if (!CAPABILITY_ID_PATTERN.test(decl.id)) {
        diag.push({ code: 'INVALID_CAPABILITY_ID', severity: 'error', message: `Invalid capability ID '${decl.id}'`, path: `${path}.id` })
      }

      if (!semverValidRange(decl.version)) {
        diag.push({ code: 'INVALID_VERSION_RANGE', severity: 'error', message: `Invalid version range '${decl.version}'`, path: `${path}.version` })
      }

      if (decl.multiplicity !== undefined && !VALID_MULTIPLICITIES.has(decl.multiplicity)) {
        diag.push({ code: 'INVALID_MULTIPLICITY', severity: 'error', message: `multiplicity must be single|one-or-more|all-compatible, got: '${decl.multiplicity}'`, path: `${path}.multiplicity` })
      }

      if (seenCapabilityIds.has(decl.id)) {
        diag.push({ code: 'DUPLICATE_CAPABILITY_ID', severity: 'error', message: `Capability '${decl.id}' declared more than once (across required and optional lists)`, path: `${path}.id` })
      } else {
        seenCapabilityIds.add(decl.id)
      }
    }
  }

  return diag
}
