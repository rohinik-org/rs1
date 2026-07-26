import type { CapabilityConstraint } from '@rohinik-org/capability-contracts-ir'
import type { ApplicationManifestDiagnostic } from '@rohinik-org/application-manifest-ir'

export function detectContradictions(
  constraints: readonly CapabilityConstraint[],
  path: string,
): readonly ApplicationManifestDiagnostic[] {
  const diag: ApplicationManifestDiagnostic[] = []

  const execModes = constraints
    .filter((c): c is Extract<CapabilityConstraint, { kind: 'execution-location' }> => c.kind === 'execution-location')
    .map(c => c.mode)

  if (execModes.includes('local-only') && execModes.includes('remote-required')) {
    diag.push({ code: 'CONTRADICTORY_CONSTRAINTS', severity: 'error', message: `Contradictory execution-location constraints: local-only and remote-required cannot both apply`, path: `${path}.constraints` })
  }

  for (const c of constraints) {
    if (c.kind === 'feature') {
      const required = new Set(c.requiredFeatures)
      for (const f of c.forbiddenFeatures) {
        if (required.has(f)) {
          diag.push({ code: 'CONTRADICTORY_CONSTRAINTS', severity: 'error', message: `Feature '${f}' is both required and forbidden`, path: `${path}.constraints` })
          break
        }
      }
    }
  }

  const residencySets = constraints
    .filter((c): c is Extract<CapabilityConstraint, { kind: 'data-residency' }> => c.kind === 'data-residency')
    .map(c => new Set(c.allowedRegions))

  if (residencySets.length > 1) {
    let intersection = residencySets[0]!
    for (let i = 1; i < residencySets.length; i++) {
      intersection = new Set([...intersection].filter(r => residencySets[i]!.has(r)))
    }
    if (intersection.size === 0) {
      diag.push({ code: 'CONTRADICTORY_CONSTRAINTS', severity: 'error', message: `Contradictory data-residency constraints: no region satisfies all constraints`, path: `${path}.constraints` })
    }
  }

  return diag
}
