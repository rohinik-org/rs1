import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import type { CapabilityManifestIR } from '@rohinik-org/capability-manifest'
import type {
  CapabilitySource,
  CapabilityCandidate,
  CapabilityBundle,
  AcquisitionQuery,
  CapabilityArtifact,
  CapabilitySourceProvider,
} from '@rohinik-org/capability-acquisition'

function makeArtifact(path: string, content: Buffer): CapabilityArtifact {
  const checksum = createHash('sha256').update(content).digest('hex')
  return {
    path,
    size: content.length,
    checksum,
    stream: async function* () { yield new Uint8Array(content) },
  }
}

function parseManifestFile(raw: string, filePath: string): CapabilityManifestIR | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    if (!obj.id || !obj.name || !obj.version) return null
    return {
      manifestVersion: Number(obj.manifestVersion ?? 1),
      id: String(obj.id),
      name: String(obj.name),
      description: String(obj.description ?? ''),
      version: String(obj.version),
      inputs: (obj.inputs as CapabilityManifestIR['inputs']) ?? [],
      outputs: (obj.outputs as CapabilityManifestIR['outputs']) ?? [],
      tier: String(obj.tier ?? 'local'),
      tags: (obj.tags as string[]) ?? [],
      driverRef: String(obj.driverRef ?? 'filesystem'),
    }
  } catch {
    return null
  }
}

export class FilesystemSource implements CapabilitySource {
  readonly sourceId = 'filesystem'
  readonly sourceType = 'filesystem'

  constructor(private readonly searchPaths: ReadonlyArray<string>) {}

  async search(query: AcquisitionQuery): Promise<ReadonlyArray<CapabilityCandidate>> {
    const candidates: CapabilityCandidate[] = []
    for (const searchPath of this.searchPaths) {
      if (!existsSync(searchPath)) continue
      const entries = await readdir(searchPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dir = join(searchPath, entry.name)
        const manifestPath = [
          join(dir, 'rohinik.yaml'),
          join(dir, 'capability-manifest.json'),
        ].find(p => existsSync(p))
        if (!manifestPath) continue

        const raw = await readFile(manifestPath, 'utf8')
        const manifest = parseManifestFile(raw, manifestPath)
        if (!manifest) continue

        const term = query.term.toLowerCase()
        if (!manifest.id.toLowerCase().includes(term) && !manifest.name.toLowerCase().includes(term)) continue
        if (query.version && manifest.version !== query.version) continue

        const content = Buffer.from(raw)
        const checksum = createHash('sha256').update(content).digest('hex')
        candidates.push({
          candidateId: `fs-${manifest.id}-${manifest.version}`,
          manifest,
          source: { type: 'filesystem', id: 'filesystem', uri: dir },
          version: manifest.version,
          publisher: 'local',
          checksum,
          score: 1.0,
          trustLevel: 'unsigned',
          compatibilityStatus: 'compatible',
        })
      }
    }
    return candidates
  }

  async fetch(candidate: CapabilityCandidate): Promise<CapabilityBundle> {
    const dir = candidate.source.uri ?? ''
    const manifestPath = [
      join(dir, 'rohinik.yaml'),
      join(dir, 'capability-manifest.json'),
    ].find(p => existsSync(p)) ?? join(dir, 'capability-manifest.json')

    const raw = await readFile(manifestPath)
    const artifact = makeArtifact(basename(manifestPath), raw)
    const bundleChecksum = artifact.checksum

    return {
      bundleId: `fs-bundle-${candidate.manifest.id}`,
      manifests: [candidate.manifest],
      artifacts: [artifact],
      checksum: bundleChecksum,
    }
  }

  async verify(bundle: CapabilityBundle): Promise<boolean> {
    return bundle.checksum.length > 0
  }
}

export class BuiltinFilesystemSourceProvider implements CapabilitySourceProvider {
  readonly providerId = 'builtin-filesystem'
  constructor(private readonly searchPaths: ReadonlyArray<string>) {}
  async load() { return [new FilesystemSource(this.searchPaths)] }
}
