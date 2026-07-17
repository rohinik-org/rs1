export interface CapabilityGraphQuery {
  reachable(from: string, maxDepth?: number): Promise<readonly string[]>
  shortestPath(from: string, to: string): Promise<readonly string[] | null>
  findNeighbors(node: string): Promise<readonly string[]>
  findAlternatives(node: string): Promise<readonly string[]>
}
