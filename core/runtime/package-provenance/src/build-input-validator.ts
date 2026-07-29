import type { BuildMaterial, InputValidationResult, ProvenancePolicy } from './types.js'

export class BuildInputValidator {
  validate(materials: readonly BuildMaterial[], policy: ProvenancePolicy): InputValidationResult {
    const materialIds = materials.map(m => m.materialId)

    const seen = new Map<string, BuildMaterial>()
    for (const material of materials) {
      const existing = seen.get(material.materialId)
      if (existing) {
        if (
          existing.digest?.value !== material.digest?.value ||
          existing.digest?.algorithm !== material.digest?.algorithm ||
          existing.uri !== material.uri
        ) {
          return { valid: false, reason: 'conflicting-provenance' }
        }
      } else {
        seen.set(material.materialId, material)
      }
    }

    for (const requiredKind of policy.requiredMaterialKinds) {
      const found = materials.some(m => m.kind === requiredKind)
      if (!found) {
        return { valid: false, reason: 'input-set-incomplete' }
      }
    }

    if (policy.requireCompleteInputSet && materials.length === 0 && policy.requiredMaterialKinds.length > 0) {
      return { valid: false, reason: 'input-set-incomplete' }
    }

    for (const material of materials) {
      if (material.mutableReference === true && policy.requireImmutableSourceRevision) {
        return { valid: false, reason: 'input-digest-mismatch' }
      }
    }

    const sortedIds = [...materialIds].sort()
    const actualIds = [...materialIds]
    const isOrdered = sortedIds.every((id, i) => id === actualIds[i])

    return { valid: true, materialEvidenceIds: isOrdered ? materialIds : sortedIds }
  }
}
