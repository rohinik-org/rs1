import semver from 'semver'
import type { AiosManifest } from '@rohinik-org/foundation'

export interface DependencyError {
  readonly type: 'CYCLE' | 'MISSING_DEPENDENCY' | 'VERSION_MISMATCH'
  readonly message: string
  readonly involvedIds: readonly string[]
}

export interface DependencyGraphResult {
  readonly order: readonly AiosManifest[]
  readonly errors: readonly DependencyError[]
}

export class CapabilityDependencyGraph {
  build(manifests: readonly AiosManifest[]): DependencyGraphResult {
    const errors: DependencyError[] = []
    const byId = new Map<string, AiosManifest>()
    for (const m of manifests) byId.set(m.id, m)

    // Check for missing dependencies and version mismatches before sort
    for (const manifest of manifests) {
      for (const dep of manifest.requiresCapabilities ?? []) {
        const found = byId.get(dep.id)
        if (!found) {
          errors.push({
            type: 'MISSING_DEPENDENCY',
            message: `'${manifest.id}' requires '${dep.id}' which was not discovered`,
            involvedIds: [manifest.id, dep.id],
          })
          continue
        }
        const range = semver.validRange(dep.contractVersion)
        if (range === null) {
          errors.push({
            type: 'VERSION_MISMATCH',
            message: `'${manifest.id}' declares dependency on '${dep.id}' with invalid contractVersion range '${dep.contractVersion}'`,
            involvedIds: [manifest.id, dep.id],
          })
          continue
        }
        const coercedVersion = semver.coerce(found.contractVersion)
        if (coercedVersion === null || !semver.satisfies(coercedVersion, range)) {
          errors.push({
            type: 'VERSION_MISMATCH',
            message: `'${manifest.id}' requires '${dep.id}' at contractVersion '${dep.contractVersion}', but discovered version is '${found.contractVersion}'`,
            involvedIds: [manifest.id, dep.id],
          })
        }
      }
    }

    // Kahn's algorithm for topological sort
    // inDegree: how many dependencies each node has (from within the discovered set)
    const inDegree = new Map<string, number>()
    const dependents = new Map<string, string[]>()  // dep -> list of manifests that depend on it

    for (const m of manifests) {
      if (!inDegree.has(m.id)) inDegree.set(m.id, 0)
      if (!dependents.has(m.id)) dependents.set(m.id, [])
      for (const dep of m.requiresCapabilities ?? []) {
        if (byId.has(dep.id)) {
          inDegree.set(m.id, (inDegree.get(m.id) ?? 0) + 1)
          if (!dependents.has(dep.id)) dependents.set(dep.id, [])
          dependents.get(dep.id)!.push(m.id)
        }
      }
    }

    const queue: string[] = []
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id)
    }

    const order: AiosManifest[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      const manifest = byId.get(id)!
      order.push(manifest)
      for (const dependentId of dependents.get(id) ?? []) {
        const newDegree = (inDegree.get(dependentId) ?? 0) - 1
        inDegree.set(dependentId, newDegree)
        if (newDegree === 0) queue.push(dependentId)
      }
    }

    // If order.length < manifests.length, there is a cycle
    if (order.length < manifests.length) {
      const sortedIds = new Set(order.map(m => m.id))
      const cycleIds = [...byId.keys()].filter(id => !sortedIds.has(id))
      errors.push({
        type: 'CYCLE',
        message: `Dependency cycle detected among: ${cycleIds.join(', ')}`,
        involvedIds: cycleIds,
      })
    }

    return { order, errors }
  }
}
