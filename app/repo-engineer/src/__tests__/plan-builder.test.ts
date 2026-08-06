import { describe, it, expect } from 'vitest'
import { buildPlanPrompt } from '../pipeline/plan-builder.js'
import type { CollectedFile } from '../pipeline/file-collector.js'

function file(path: string, content: string): CollectedFile {
  return { path, content, sizeBytes: content.length }
}

describe('buildPlanPrompt', () => {
  it('includes request and repo path', () => {
    const result = buildPlanPrompt({ request: 'Add logging', files: [], repoPath: '/repo' })
    expect(result).toContain('Request: Add logging')
    expect(result).toContain('Repository: /repo')
  })

  it('includes file headers and content', () => {
    const result = buildPlanPrompt({
      request: 'test',
      files: [file('src/index.ts', 'export const x = 1')],
      repoPath: '/repo',
    })
    expect(result).toContain('--- src/index.ts ---')
    expect(result).toContain('export const x = 1')
  })

  it('includes closing instruction', () => {
    const result = buildPlanPrompt({ request: 'test', files: [], repoPath: '/r' })
    expect(result).toContain('Provide a concrete, step-by-step implementation plan.')
  })

  it('truncates content to stay within maxChars', () => {
    const bigFile = file('big.ts', 'x'.repeat(10_000))
    const result = buildPlanPrompt({ request: 'test', files: [bigFile], repoPath: '/r', maxChars: 500 })
    expect(result.length).toBeLessThanOrEqual(600)
    expect(result).toContain('[truncated]')
  })

  it('distributes budget proportionally across multiple files', () => {
    const files = [file('a.ts', 'a'.repeat(5000)), file('b.ts', 'b'.repeat(5000))]
    const result = buildPlanPrompt({ request: 'test', files, repoPath: '/r', maxChars: 1000 })
    expect(result).toContain('[truncated]')
    expect(result).toContain('--- a.ts ---')
    expect(result).toContain('--- b.ts ---')
  })

  it('handles zero files gracefully', () => {
    const result = buildPlanPrompt({ request: 'empty', files: [], repoPath: '/r' })
    expect(result).toContain('Files reviewed: 0')
    expect(result).not.toContain('---')
  })
})
