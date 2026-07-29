import type { TrustRoot, TrustPath, TrustPathEdge } from './types.js'

const MAX_PATH_DEPTH = 8

export type TrustPathBuildResult =
  | { readonly built: true; readonly path: TrustPath }
  | { readonly built: false; readonly reason: 'path-not-found' | 'ambiguous-path' | 'cycle-detected' | 'depth-exceeded' | 'malformed-path' }

interface PathNode {
  readonly id: string
  readonly edges: TrustPathEdge[]
}

function buildPath(
  signerId: string,
  root: TrustRoot,
): TrustPathBuildResult {
  // Direct signer-to-root path: signer → anchorId
  if (signerId === root.anchorId) {
    const path: TrustPath = {
      anchorId: root.anchorId,
      edges: [],
      evidenceIds: [root.trustRootId],
      depth: 0,
    }
    return { built: true, path }
  }

  // One-hop: signer → root.trustRootId → anchorId
  if (root.trustRootId !== root.anchorId) {
    if (root.trustRootId === signerId || root.snapshotId === signerId) {
      const edge: TrustPathEdge = {
        fromId: signerId,
        toId: root.anchorId,
        evidenceId: root.trustRootId,
      }
      const path: TrustPath = {
        anchorId: root.anchorId,
        edges: [edge],
        evidenceIds: [root.trustRootId],
        depth: 1,
      }
      return { built: true, path }
    }
  }

  return { built: false, reason: 'path-not-found' }
}

export class TrustPathBuilder {
  build(
    signerId: string,
    roots: readonly TrustRoot[],
  ): TrustPathBuildResult {
    if (!signerId || roots.length === 0) {
      return { built: false, reason: 'path-not-found' }
    }

    const candidates: TrustPath[] = []

    for (const root of roots) {
      const result = buildPath(signerId, root)
      if (result.built) {
        if (result.path.depth > MAX_PATH_DEPTH) {
          return { built: false, reason: 'depth-exceeded' }
        }
        candidates.push(result.path)
      }
    }

    if (candidates.length === 0) {
      return { built: false, reason: 'path-not-found' }
    }

    // Detect ambiguous equally valid paths at the same depth
    const minDepth = Math.min(...candidates.map(p => p.depth))
    const equalDepth = candidates.filter(p => p.depth === minDepth)

    if (equalDepth.length > 1) {
      // Only ambiguous if they lead to different anchors
      const anchors = new Set(equalDepth.map(p => p.anchorId))
      if (anchors.size > 1) {
        return { built: false, reason: 'ambiguous-path' }
      }
      // Same anchor, same depth — take the first by stable sort
    }

    const best = equalDepth[0]!
    return { built: true, path: best }
  }
}
