// GraphLayoutAlgorithmId: typed union — never raw string for architectural identifiers.
export type GraphLayoutAlgorithmId =
  | 'grid'
  | 'tree'
  | 'force-directed'
  | 'circular'
  | 'custom'          // reserved: marketplace algorithms register under their own ids but declare kind 'custom'

export interface NodePosition {
  readonly nodeId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface EdgeRoute {
  readonly edgeId: string
  readonly points: readonly { readonly x: number; readonly y: number }[]
}

export interface GraphViewport {
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

// GraphLayout is an immutable rendering artifact produced by GraphLayoutAlgorithm.
// GraphBuilder produces RuntimeGraph (data). GraphLayoutAlgorithm produces GraphLayout (presentation).
// layoutHash replaces generatedAt: two identical computations produce identical hashes (CONSOLE-014).
export interface GraphLayout {
  readonly layoutId: string
  readonly graphId: string
  readonly algorithm: GraphLayoutAlgorithmId
  readonly layoutHash: string              // hash(graphId + algorithm + options + nodePositions)
  readonly nodePositions: readonly NodePosition[]
  readonly edgeRoutes: readonly EdgeRoute[]
  readonly viewport?: GraphViewport        // optional: exported/server/test layouts may omit
}

// GraphLayoutOptions passed to algorithm.compute(graph, options).
// Extensible record — algorithms declare which keys they consume.
export interface GraphLayoutOptions {
  readonly direction?: 'LR' | 'TB' | 'RL' | 'BT'
  readonly nodeSpacing?: number
  readonly rankSpacing?: number
  readonly clusterPadding?: number
  readonly seed?: number              // for deterministic force-directed layouts
  readonly viewport?: GraphViewport   // hint; algorithm may adjust
  [key: string]: unknown              // extension algorithms may add custom options
}
