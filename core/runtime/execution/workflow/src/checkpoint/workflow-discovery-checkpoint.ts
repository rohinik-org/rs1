// ponytail: reserved — not implemented in Stage 5C; stable API seam for incremental discovery
export interface WorkflowDiscoveryCheckpoint {
  readonly lastCorpusOffset: number
  readonly lastProcessedTimestamp: string
}
