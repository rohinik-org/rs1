import { z } from 'zod'
import * as fs from 'node:fs/promises'
import type { AiosManifest } from '@rohinik-org/foundation'

const ManifestCapabilityDepSchema = z.object({
  id: z.string(),
  contractVersion: z.string(),
})

const AiosManifestSchema = z.object({
  schemaVersion: z.string(),
  runtimeVersion: z.string(),
  type: z.enum(['capability', 'provider', 'memory', 'policy', 'telemetry', 'scheduler', 'ui']),
  compatibility: z.enum(['stable', 'experimental', 'deprecated']),
  id: z.string(),
  name: z.string(),
  version: z.string(),
  contractVersion: z.string(),
  entry: z.string(),
  requiresProviders: z.array(z.string()).readonly().optional(),
  requiresCapabilities: z.array(ManifestCapabilityDepSchema).readonly().optional(),
  requiresFeatures: z.array(z.string()).readonly().optional(),
  skills: z.array(z.string()).readonly().optional(),
  permissions: z.array(z.string()).readonly().optional(),
})

export interface ParseSuccess {
  readonly ok: true
  readonly manifest: AiosManifest
}

export interface ParseError {
  readonly ok: false
  readonly errors: readonly string[]
  readonly source?: string
}

export type ParseResult = ParseSuccess | ParseError

export class ManifestParser {
  parse(raw: unknown, source?: string): ParseResult {
    const result = AiosManifestSchema.safeParse(raw)
    if (result.success) {
      return { ok: true, manifest: result.data as AiosManifest }
    }
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    return source !== undefined ? { ok: false, errors, source } : { ok: false, errors }
  }

  async parseFile(filePath: string): Promise<ParseResult> {
    let raw: unknown
    try {
      const text = await fs.readFile(filePath, 'utf-8')
      raw = JSON.parse(text)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, errors: [message], source: filePath }
    }
    return this.parse(raw, filePath)
  }
}
