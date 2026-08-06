import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'

export interface CollectedFile {
  path: string
  content: string
  sizeBytes: number
}

export interface CollectOptions {
  maxFiles?: number
  maxFileSizeBytes?: number
  extensions?: string[]
  excludeDirs?: string[]
}

const DEFAULTS = {
  maxFiles: 20,
  maxFileSizeBytes: 50_000,
  extensions: ['.ts', '.js', '.json', '.md'],
  excludeDirs: ['node_modules', 'dist', '.git', '.claude', '.rohinik', 'coverage'],
} as const

export async function collectFiles(repoPath: string, opts?: CollectOptions): Promise<CollectedFile[]> {
  const maxFiles = opts?.maxFiles ?? DEFAULTS.maxFiles
  const maxFileSizeBytes = opts?.maxFileSizeBytes ?? DEFAULTS.maxFileSizeBytes
  const extensions = new Set(opts?.extensions ?? DEFAULTS.extensions)
  const excludeDirs = new Set(opts?.excludeDirs ?? DEFAULTS.excludeDirs)

  const collected: CollectedFile[] = []

  async function walk(dir: string): Promise<void> {
    if (collected.length >= maxFiles) return

    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (collected.length >= maxFiles) break
      const fullPath = join(dir, entry)

      let info
      try {
        info = await stat(fullPath)
      } catch {
        continue
      }

      if (info.isDirectory()) {
        if (!excludeDirs.has(entry)) await walk(fullPath)
        continue
      }

      if (!extensions.has(extname(entry))) continue
      if (info.size > maxFileSizeBytes) continue

      let content: string
      try {
        content = await readFile(fullPath, 'utf-8')
      } catch {
        continue
      }

      collected.push({
        path: relative(repoPath, fullPath),
        content,
        sizeBytes: info.size,
      })
    }
  }

  await walk(repoPath)
  return collected
}
