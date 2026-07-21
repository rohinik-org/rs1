import { describe, it, expect, vi } from 'vitest'
import { GitHubSource } from '../index.js'

const MOCK_MANIFEST = {
  id: 'test-gh-cap',
  name: 'test-gh-cap',
  version: '1.0.0',
  description: '',
  manifestVersion: 1,
  inputs: [],
  outputs: [],
  tier: 'remote',
  tags: ['rohinik-capability'],
  driverRef: 'github',
}

function makeMockFetcher(overrides: Record<string, unknown> = {}) {
  return vi.fn(async (url: string) => {
    if (url.includes('search/repositories')) {
      return { items: [{ full_name: 'test-org/test-repo', description: null, topics: ['rohinik-capability'], stargazers_count: 10 }] }
    }
    if (url.includes('raw.githubusercontent.com')) {
      return { ...MOCK_MANIFEST, ...overrides }
    }
    if (url.includes('releases/latest')) {
      return { tag_name: 'v1.0.0', assets: [{ name: 'cap.tar.gz', browser_download_url: 'https://example.com/cap.tar.gz', size: 1024 }] }
    }
    throw new Error(`Unexpected URL: ${url}`)
  })
}

describe('GitHubSource (mocked)', () => {
  it('search returns candidates for matching repos', async () => {
    const fetcher = makeMockFetcher()
    const source = new GitHubSource(undefined, fetcher as never)
    const results = await source.search({ term: 'test-gh-cap' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].manifest.id).toBe('test-gh-cap')
  })

  it('returns empty when no rohinik.yaml at root', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('search/repositories')) {
        return { items: [{ full_name: 'test-org/no-manifest', description: null, topics: [], stargazers_count: 0 }] }
      }
      throw new Error('no manifest')
    })
    const source = new GitHubSource(undefined, fetcher as never)
    const results = await source.search({ term: 'no-manifest' })
    expect(results).toHaveLength(0)
  })

  it('fetch returns bundle with correct manifest', async () => {
    const fetcher = makeMockFetcher()
    const source = new GitHubSource(undefined, fetcher as never)
    const candidates = await source.search({ term: 'test-gh-cap' })
    const bundle = await source.fetch(candidates[0])
    expect(bundle.manifests).toHaveLength(1)
    expect(bundle.manifests[0].id).toBe('test-gh-cap')
  })
})
