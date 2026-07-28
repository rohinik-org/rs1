import type {
  AuthorizedCapabilityResolutionPlan,
  AuthorizedProvisioningAction,
  ProvisioningActionId,
} from '@rohinik-org/provisioning-ir'
import { PreflightError, CyclicDependencyError } from '@rohinik-org/provisioning-ir'

export interface CompiledActionGraph {
  readonly topologicalOrder: readonly ProvisioningActionId[]
  readonly actionById: ReadonlyMap<ProvisioningActionId, AuthorizedProvisioningAction>
}

export class ActionGraphCompiler {
  compile(plan: AuthorizedCapabilityResolutionPlan): CompiledActionGraph {
    const diagnostics: string[] = []
    const actions = plan.authorizedActions

    // Build ID map; check duplicates (defense-in-depth)
    const actionById = new Map<ProvisioningActionId, AuthorizedProvisioningAction>()
    for (const action of actions) {
      if (actionById.has(action.actionId)) {
        diagnostics.push(`duplicate actionId: ${action.actionId}`)
      } else {
        actionById.set(action.actionId, action)
      }
    }

    // Check dependsOn references and self-loops
    for (const action of actions) {
      for (const depId of action.dependsOn) {
        if (depId === action.actionId) {
          diagnostics.push(`self-loop: action ${action.actionId} depends on itself`)
        } else if (!actionById.has(depId)) {
          diagnostics.push(`missing dependency: action ${action.actionId} depends on unknown ${depId}`)
        }
      }
    }

    // Validate mutation-policy / action-kind invariants
    for (const action of actions) {
      const mp = action.mutationPolicy

      if (action.kind === 'validate-provider') {
        if (mp.mutating !== false) {
          diagnostics.push(`validate-provider action ${action.actionId} must have mutating: false`)
        }
      }

      if (action.kind === 'apply-configuration-template') {
        const wp = action.template.writePolicy
        if ((wp === 'create-if-absent' || wp === 'replace-authorized-generated-file') && mp.mutating !== true) {
          diagnostics.push(`apply-configuration-template action ${action.actionId} with writePolicy '${wp}' requires mutating: true`)
        }
        if (wp === 'validate-only' && mp.mutating !== false) {
          diagnostics.push(`apply-configuration-template action ${action.actionId} with writePolicy 'validate-only' requires mutating: false`)
        }
      }

      // Every mutating action needs compensation classification; non-compensable needs approvedReasonCode
      if (mp.mutating === true) {
        const comp = mp.compensation
        if (comp.kind === 'non-compensable' && !('approvedReasonCode' in comp && comp.approvedReasonCode)) {
          diagnostics.push(`mutating action ${action.actionId} has non-compensable compensation without approvedReasonCode`)
        }
      }
    }

    // Cross-reference: install-language-package → npmInstallManifests
    const manifestHashes = new Set(plan.npmInstallManifests.map(m => m.semanticHash))
    for (const action of actions) {
      if (action.kind === 'install-language-package') {
        if (!manifestHashes.has(action.npmManifestHash)) {
          diagnostics.push(`install-language-package action ${action.actionId} references unknown npmManifestHash ${action.npmManifestHash}`)
        }
      }
    }

    // Cross-reference: fetch-artifact → verifiedArtifacts
    const artifactAuthIds = new Set(plan.verifiedArtifacts.map(a => a.artifactAuthorizationId))
    for (const action of actions) {
      if (action.kind === 'fetch-artifact') {
        if (!artifactAuthIds.has(action.artifactAuthorizationId)) {
          diagnostics.push(`fetch-artifact action ${action.actionId} references unknown artifactAuthorizationId ${action.artifactAuthorizationId}`)
        }
      }
    }

    // Duplicate activate-provider for same providerId
    const seenProviderIds = new Map<string, ProvisioningActionId>()
    for (const action of actions) {
      if (action.kind === 'activate-provider') {
        const pid = action.activation.providerId
        if (seenProviderIds.has(pid)) {
          diagnostics.push(`duplicate activate-provider for providerId '${pid}': actions ${seenProviderIds.get(pid)} and ${action.actionId}`)
        } else {
          seenProviderIds.set(pid, action.actionId)
        }
      }
    }

    if (diagnostics.length > 0) {
      throw new PreflightError(diagnostics, `Preflight failed: ${diagnostics.length} error(s)`)
    }

    // Kahn's topological sort with code-unit actionId tie-breaker
    // Build adjacency: dependsOn means "this action depends on depId" → depId has an outgoing edge to this action
    const outgoing = new Map<ProvisioningActionId, ProvisioningActionId[]>()
    const inDegree = new Map<ProvisioningActionId, number>()
    for (const id of actionById.keys()) {
      outgoing.set(id, [])
      inDegree.set(id, 0)
    }
    for (const action of actions) {
      for (const depId of action.dependsOn) {
        outgoing.get(depId)!.push(action.actionId)
        inDegree.set(action.actionId, inDegree.get(action.actionId)! + 1)
      }
    }

    // Queue: sorted by actionId code-unit order
    const queue: ProvisioningActionId[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }
    // ponytail: sort once, then insert-in-order on each decrement
    queue.sort()

    const topologicalOrder: ProvisioningActionId[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      topologicalOrder.push(id)
      const neighbors = outgoing.get(id)!
      // sort neighbors so insertion maintains determinism
      neighbors.sort()
      for (const neighborId of neighbors) {
        const newDeg = inDegree.get(neighborId)! - 1
        inDegree.set(neighborId, newDeg)
        if (newDeg === 0) {
          // insert in sorted position
          let lo = 0, hi = queue.length
          while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (queue[mid]! < neighborId) lo = mid + 1
            else hi = mid
          }
          queue.splice(lo, 0, neighborId)
        }
      }
    }

    if (topologicalOrder.length < actions.length) {
      const remaining = [...actionById.keys()].filter(id => !topologicalOrder.includes(id))
      throw new CyclicDependencyError(remaining as ProvisioningActionId[], `Cyclic dependency detected among actions: ${remaining.join(', ')}`)
    }

    return { topologicalOrder: topologicalOrder as readonly ProvisioningActionId[], actionById }
  }
}
