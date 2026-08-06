import { describe, it, expect } from 'vitest'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const FORBIDDEN = [
  '@rohinik-org/runtime',
  '@rohinik-org/kernel',
  '@rohinik-org/foundation',
  '@rohinik-org/planner',
  '@rohinik-org/execution',
  '@rohinik-org/evaluation',
  '@rohinik-org/experience',
  'core/runtime',
  'core/intelligence',
  'core/memory',
  '../../core',
  '../../../core',
]

async function collectTs(dir: string): Promise<string[]> {
  const results: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist') {
      results.push(...await collectTs(full))
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      results.push(full)
    }
  }
  return results
}

describe('Boundary check — no forbidden imports', () => {
  it('src/**/*.ts contains no imports from Rohinik internals', async () => {
    const srcDir = join(import.meta.dirname ?? __dirname, 'src')
    const files = await collectTs(srcDir)

    const violations: string[] = []

    const { readFile } = await import('node:fs/promises')
    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      const importLines = content
        .split('\n')
        .filter(line => /^\s*(import|export)\s/.test(line))
      for (const pattern of FORBIDDEN) {
        if (importLines.some(line => line.includes(pattern))) {
          violations.push(`${file}: contains forbidden import "${pattern}"`)
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(`Boundary violations found:\n${violations.join('\n')}`)
    }

    expect(files.length).toBeGreaterThan(0)
  })
})
