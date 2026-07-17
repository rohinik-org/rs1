import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AiosManifest } from '@rohinik-org/foundation'
import type { ManifestParser } from './parser.js'
import type { ManifestValidator } from './validator.js'
import type { CapabilityDependencyGraph } from './dependency-graph.js'
import type { ActivationPlan } from '../runtime/types.js'

export class ManifestLoader {
  constructor(
    private readonly parser: ManifestParser,
    private readonly validator: ManifestValidator,
    private readonly graph: CapabilityDependencyGraph,
  ) {}

  async load(scanPaths: readonly string[]): Promise<ActivationPlan> {
    const manifests: AiosManifest[] = []
    const warnings: string[] = []

    for (const scanPath of scanPaths) {
      let entries: string[]
      try {
        const dirents = await fs.readdir(scanPath, { withFileTypes: true })
        entries = dirents
          .filter(d => d.isDirectory())
          .map(d => path.join(scanPath, d.name))
      } catch {
        warnings.push(`Could not read scan path '${scanPath}'`)
        continue
      }

      for (const entry of entries) {
        const manifestPath = path.join(entry, 'rohinik.manifest.json')
        const parseResult = await this.parser.parseFile(manifestPath)
        if (!parseResult.ok) {
          warnings.push(`Skipping '${manifestPath}': ${parseResult.errors.join('; ')}`)
          continue
        }

        const validationResult = this.validator.validate(parseResult.manifest)
        if (!validationResult.valid) {
          warnings.push(
            `Skipping '${manifestPath}': ${validationResult.errors.join('; ')}`,
          )
          continue
        }

        warnings.push(...validationResult.warnings)
        // Resolve entry: keep absolute URLs as-is; resolve relative paths to absolute file:// URLs
        const rawEntry = parseResult.manifest.entry
        const isUrl = /^[a-z]+:\/\//i.test(rawEntry)
        const resolvedEntry = isUrl
          ? rawEntry
          : pathToFileURL(path.resolve(path.dirname(manifestPath), rawEntry)).href
        manifests.push({ ...parseResult.manifest, entry: resolvedEntry })
      }
    }

    const graphResult = this.graph.build(manifests)

    return {
      manifests: graphResult.order,
      errors: graphResult.errors,
      warnings,
    }
  }
}
