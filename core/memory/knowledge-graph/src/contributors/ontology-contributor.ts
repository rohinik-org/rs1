import type { CapabilityGraphNode } from '@rohinik-org/compiler'
import type { GraphContributor, GraphContribution, GraphContributionContext } from '../graph-builder.js'

const CONCEPTS = [
  { id: 'concept://python', name: 'python', displayName: 'Python' },
  { id: 'concept://node', name: 'node', displayName: 'Node.js' },
  { id: 'concept://docker', name: 'docker', displayName: 'Docker' },
  { id: 'concept://git', name: 'git', displayName: 'Git' },
  { id: 'concept://csv', name: 'csv', displayName: 'CSV Data' },
  { id: 'concept://json', name: 'json', displayName: 'JSON Data' },
  { id: 'concept://markdown', name: 'markdown', displayName: 'Markdown' },
  { id: 'concept://docker-image', name: 'docker-image', displayName: 'Docker Image' },
  { id: 'concept://cuda', name: 'cuda', displayName: 'CUDA' },
  { id: 'concept://rest-api', name: 'rest-api', displayName: 'REST API' },
  { id: 'concept://shell', name: 'shell', displayName: 'Shell' },
  { id: 'concept://filesystem', name: 'filesystem', displayName: 'Filesystem' },
  { id: 'concept://dataframe',             name: 'dataframe',             displayName: 'DataFrame' },
  { id: 'concept://chart',                 name: 'chart',                 displayName: 'Chart/Visualization' },
  { id: 'concept://numerical-computation', name: 'numerical-computation', displayName: 'Numerical Computation' },
  { id: 'concept://data-analysis',         name: 'data-analysis',         displayName: 'Data Analysis' },
  { id: 'concept://cad',                   name: 'cad',                   displayName: 'CAD Design' },
  { id: 'concept://dxf',                   name: 'dxf',                   displayName: 'DXF File Format' },
  { id: 'concept://step',                  name: 'step',                  displayName: 'STEP 3D Model' },
  { id: 'concept://cad-geometry',          name: 'cad-geometry',          displayName: 'CAD Geometry' },
  { id: 'concept://deployment',            name: 'deployment',            displayName: 'Deployment' },
  { id: 'concept://version-control',       name: 'version-control',       displayName: 'Version Control' },
  { id: 'concept://yaml',                  name: 'yaml',                  displayName: 'YAML' },
  { id: 'concept://jupyter',               name: 'jupyter',               displayName: 'Jupyter Notebook' },
]

export class OntologyContributor implements GraphContributor {
  readonly contributorId = 'ontology'
  async contribute(ctx: GraphContributionContext): Promise<GraphContribution> {
    const existingIds = new Set(ctx.existingGraph.nodes.map(n => n.nodeId))
    const now = new Date().toISOString()
    const nodes: CapabilityGraphNode[] = CONCEPTS.filter(c => !existingIds.has(c.id)).map(c => ({ nodeId: c.id, nodeKind: 'CONCEPT' as const, name: c.name, displayName: c.displayName, tags: ['concept'], metadata: {}, addedAt: now }))
    return { nodes, edges: [] }
  }
}
