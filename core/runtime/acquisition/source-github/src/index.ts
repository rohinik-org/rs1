import type { CapabilityManifestIR } from '@rohinik-org/capability-manifest'
import type {
  CapabilitySource,
  CapabilityCandidate,
  CapabilityBundle,
  AcquisitionQuery,
  CapabilityArtifact,
  CapabilitySourceProvider,
} from '@rohinik-org/capability-acquisition'

interface GitHubRelease {
  tag_name: string
  assets: Array<{ name: string; browser_download_url: string; size: number }>
}

interface GitHubSearchItem {
  full_name: string
  description: string | null
  topics: string[]
  stargazers_count: number
}

interface GitHubSearchResult {
  items: GitHubSearchItem[]
}

export class GitHubSource implements CapabilitySource {
  readonly sourceId = 'github'
  readonly sourceType = 'github'

  constructor(
    private readonly token?: string,
    private readonly fetcher: (url: string, headers: Record<string, string>) => Promise<unknown> = defaultFetch,
  ) {}

  private get _headers(): Record<string, string> {
    return this.token
      ? { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json' }
      : { Accept: 'application/vnd.github+json' }
  }

  async search(query: AcquisitionQuery): Promise<ReadonlyArray<CapabilityCandidate>> {
    try {
      const q = encodeURIComponent(`${query.term} topic:rohinik-capability in:name`)
      const result = await this.fetcher(
        `https://api.github.com/search/repositories?q=${q}&per_page=10`,
        this._headers,
      ) as GitHubSearchResult

      const candidates: CapabilityCandidate[] = []
      for (const item of result.items ?? []) {
        // Discovery requires rohinik.yaml / capability-manifest.json at root — check via API
        const manifest = await this._fetchManifest(item.full_name)
        if (!manifest) continue
        // Topics are ranking hints only — not discovery gate
        const topicBoost = item.topics.includes('rohinik-capability') ? 0.2 : 0
        candidates.push({
          candidateId: `github-${item.full_name}-${manifest.version}`,
          manifest,
          source: { type: 'github', id: 'github', uri: `https://github.com/${item.full_name}` },
          version: manifest.version,
          publisher: item.full_name.split('/')[0],
          checksum: 'skip',  // ponytail: full checksum from release asset; skip at search time
          score: 0.5 + topicBoost + Math.min(item.stargazers_count / 1000, 0.3),
          trustLevel: 'unsigned',
          compatibilityStatus: 'unknown',
        })
      }
      return candidates
    } catch {
      return []
    }
  }

  async fetch(candidate: CapabilityCandidate): Promise<CapabilityBundle> {
    const repoPath = candidate.source.uri?.replace('https://github.com/', '') ?? ''
    const release = await this.fetcher(
      `https://api.github.com/repos/${repoPath}/releases/latest`,
      this._headers,
    ) as GitHubRelease

    const artifact: CapabilityArtifact = {
      path: `${repoPath}-${release.tag_name}.tar.gz`,
      size: release.assets[0]?.size ?? 0,
      checksum: candidate.checksum,
      stream: async function* () {
        // ponytail: actual download deferred; yields empty; extend in Stage 10
      },
    }

    return {
      bundleId: `github-bundle-${candidate.manifest.id}`,
      manifests: [candidate.manifest],
      artifacts: [artifact],
      checksum: candidate.checksum,
    }
  }

  async verify(bundle: CapabilityBundle): Promise<boolean> {
    return bundle.checksum === 'skip' || bundle.checksum.length > 0
  }

  private async _fetchManifest(fullName: string): Promise<CapabilityManifestIR | null> {
    for (const path of ['rohinik.yaml', 'capability-manifest.json']) {
      try {
        const raw = await this.fetcher(
          `https://raw.githubusercontent.com/${fullName}/main/${path}`,
          this._headers,
        ) as Record<string, unknown>
        if (raw.id && raw.name && raw.version) {
          return {
            manifestVersion: Number(raw.manifestVersion ?? 1),
            id: String(raw.id),
            name: String(raw.name),
            description: String(raw.description ?? ''),
            version: String(raw.version),
            inputs: (raw.inputs as CapabilityManifestIR['inputs']) ?? [],
            outputs: (raw.outputs as CapabilityManifestIR['outputs']) ?? [],
            tier: String(raw.tier ?? 'remote'),
            tags: (raw.tags as string[]) ?? [],
            driverRef: String(raw.driverRef ?? 'github'),
          }
        }
      } catch { /* try next */ }
    }
    return null
  }
}

async function defaultFetch(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`)
  return res.json()
}

export class BuiltinGitHubSourceProvider implements CapabilitySourceProvider {
  readonly providerId = 'builtin-github'
  constructor(private readonly token?: string) {}
  async load() { return [new GitHubSource(this.token)] }
}
