import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { SemanticContributor } from '../contributors/semantic-contributor.js'
import { GraphStore } from '../graph-store.js'
import { OntologyContributor } from '../contributors/ontology-contributor.js'

const roots: string[] = []
async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `sc-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}
afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

describe('SemanticContributor', () => {
  it('emits REQUIRES_HOST edges from catalog entries with semantic metadata', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const catalog = {
      catalogVersion: '1.0', updatedAt: new Date().toISOString(),
      entries: [{
        id: '@rohinik-org/pandas-skill', version: '1.0.0', protocol: 'asset:claude',
        status: 'enabled', registeredCapabilityIds: ['pandas-analyze'],
        installedAt: new Date().toISOString(), descriptorIrId: 'x', registrationRecordId: 'y',
        complianceLevel: 0,
        notes: JSON.stringify({ semanticMetadata: [{ capabilityId: 'pandas-analyze', requiresHost: ['python'], requiresProviders: [], consumes: ['csv'], produces: ['dataframe'], implements: [], recommends: ['jupyter'] }] }),
      }],
    }
    await writeFile(join(root, '.aios', 'catalog.json'), JSON.stringify(catalog))
    const store = new GraphStore(root)
    const ontologyContrib = await new OntologyContributor().contribute({ projectRoot: root, existingGraph: store.empty() })
    const baseGraph = store.merge(store.empty(), ontologyContrib.nodes, ontologyContrib.edges)
    const contributor = new SemanticContributor()
    const result = await contributor.contribute({ projectRoot: root, existingGraph: baseGraph })
    const requiresHostEdges = result.edges.filter(e => e.relationship === 'REQUIRES_HOST')
    expect(requiresHostEdges.length).toBeGreaterThan(0)
    expect(requiresHostEdges.some(e => e.target === 'concept://python')).toBe(true)
  })

  it('emits CONSUMES and PRODUCES edges', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const catalog = {
      catalogVersion: '1.0', updatedAt: new Date().toISOString(),
      entries: [{
        id: '@rohinik-org/csv-skill', version: '1.0.0', protocol: 'asset:claude',
        status: 'enabled', registeredCapabilityIds: ['csv-parse'],
        installedAt: new Date().toISOString(), descriptorIrId: 'a', registrationRecordId: 'b',
        complianceLevel: 0,
        notes: JSON.stringify({ semanticMetadata: [{ capabilityId: 'csv-parse', requiresHost: [], requiresProviders: [], consumes: ['csv'], produces: ['dataframe'], implements: [], recommends: [] }] }),
      }],
    }
    await writeFile(join(root, '.aios', 'catalog.json'), JSON.stringify(catalog))
    const store = new GraphStore(root)
    const ontologyContrib = await new OntologyContributor().contribute({ projectRoot: root, existingGraph: store.empty() })
    const baseGraph = store.merge(store.empty(), ontologyContrib.nodes, ontologyContrib.edges)
    const contributor = new SemanticContributor()
    const result = await contributor.contribute({ projectRoot: root, existingGraph: baseGraph })
    expect(result.edges.some(e => e.relationship === 'CONSUMES' && e.target === 'concept://csv')).toBe(true)
    expect(result.edges.some(e => e.relationship === 'PRODUCES' && e.target === 'concept://dataframe')).toBe(true)
  })

  it('skips entries without semantic metadata notes', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const catalog = {
      catalogVersion: '1.0', updatedAt: new Date().toISOString(),
      entries: [{ id: '@rohinik-org/mcp', version: '1.0.0', protocol: 'mcp', status: 'enabled', registeredCapabilityIds: ['filesystem.read'], installedAt: new Date().toISOString(), descriptorIrId: 'x', registrationRecordId: 'y', complianceLevel: 0 }],
    }
    await writeFile(join(root, '.aios', 'catalog.json'), JSON.stringify(catalog))
    const store = new GraphStore(root)
    const result = await new SemanticContributor().contribute({ projectRoot: root, existingGraph: store.empty() })
    expect(result.edges).toHaveLength(0)
  })
})
