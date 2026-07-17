import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { GraphBuilder } from '../graph-builder.js'
import { GraphStore } from '../graph-store.js'
import { OntologyContributor } from '../contributors/ontology-contributor.js'
import { HostContributor } from '../contributors/host-contributor.js'

const roots: string[] = []
async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `gb-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}
afterEach(async () => { for (const r of roots) await rm(r, { recursive: true, force: true }); roots.length = 0 })

describe('GraphBuilder', () => {
  it('builds a graph with OntologyContributor', async () => {
    const root = await tmpRoot()
    const store = new GraphStore(root)
    const builder = new GraphBuilder(store)
    builder.register(new OntologyContributor())
    const graph = await builder.build({ projectRoot: root, existingGraph: store.empty() })
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(graph.nodes.some(n => n.nodeKind === 'CONCEPT')).toBe(true)
  })

  it('deduplicates nodes on rebuild', async () => {
    const root = await tmpRoot()
    const store = new GraphStore(root)
    const builder = new GraphBuilder(store)
    builder.register(new OntologyContributor())
    const g1 = await builder.build({ projectRoot: root, existingGraph: store.empty() })
    const g2 = await builder.build({ projectRoot: root, existingGraph: g1 })
    expect(g2.nodeCount).toBe(g1.nodeCount)
  })

  it('HostContributor adds nodes from host-inventory.json', async () => {
    const root = await tmpRoot()
    await mkdir(join(root, '.aios'), { recursive: true })
    const inv = { kind: 'HostInventory', schemaVersion: '1.0', inventoryId: 'abc', capturedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString(), platform: 'linux', arch: 'x64', nodeVersion: '22.0.0', resources: [{ id: 'rohinik://host/python', name: 'python', displayName: 'Python 3.12', resourceType: 'binary', detectedAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString(), platform: 'linux', healthStatus: 'AVAILABLE', confidence: 1, priority: 80, version: '3.12.4', installationSource: 'apt', metadata: {} }], resourceCount: 1, availableCount: 1, unavailableCount: 0 }
    await writeFile(join(root, '.aios', 'host-inventory.json'), JSON.stringify(inv))
    const store = new GraphStore(root)
    const builder = new GraphBuilder(store)
    builder.register(new OntologyContributor())
    builder.register(new HostContributor())
    const graph = await builder.build({ projectRoot: root, existingGraph: store.empty() })
    expect(graph.nodes.some(n => n.nodeId === 'rohinik://graph/host-resource/python')).toBe(true)
    expect(graph.edges.some(e => e.relationship === 'PROVIDES_RUNTIME')).toBe(true)
  })
})
