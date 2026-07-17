import { describe, it, expect, afterEach } from 'vitest'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { GraphStore } from '../graph-store.js'

const roots: string[] = []
async function tmpRoot(): Promise<string> {
  const dir = join(tmpdir(), `graph-store-test-${randomUUID()}`)
  await mkdir(dir, { recursive: true })
  roots.push(dir)
  return dir
}
afterEach(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true })
  roots.length = 0
})

describe('GraphStore', () => {
  it('returns empty graph when no file exists', async () => {
    const root = await tmpRoot()
    const store = new GraphStore(root)
    const graph = await store.read()
    expect(graph.kind).toBe('CapabilityGraph')
    expect(graph.nodes).toHaveLength(0)
    expect(graph.edges).toHaveLength(0)
    expect(graph.revision).toBe(0)
  })

  it('writes and reads back a graph', async () => {
    const root = await tmpRoot()
    const store = new GraphStore(root)
    await store.write(store.empty())
    const read = await store.read()
    expect(read.kind).toBe('CapabilityGraph')
  })

  it('merge adds new nodes without duplicates', async () => {
    const root = await tmpRoot()
    const store = new GraphStore(root)
    const base = store.empty()
    const now = new Date().toISOString()
    const node = { nodeId: 'concept://python', nodeKind: 'CONCEPT' as const, name: 'python', displayName: 'Python', tags: [], metadata: {}, addedAt: now }
    const merged = store.merge(base, [node], [])
    const merged2 = store.merge(merged, [node], []) // duplicate
    expect(merged2.nodeCount).toBe(1) // no duplicate
  })

  it('isStale returns false for fresh graph', async () => {
    const root = await tmpRoot()
    const store = new GraphStore(root)
    const graph = store.empty()
    expect(store.isStale(graph, 24)).toBe(false)
  })
})
