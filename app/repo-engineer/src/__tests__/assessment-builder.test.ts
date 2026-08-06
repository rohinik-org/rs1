import { describe, it, expect } from 'vitest'
import { buildAssessmentPrompt } from '../pipeline/assessment-builder.js'
import type { CollectedFile } from '../pipeline/file-collector.js'

function file(path: string, content: string): CollectedFile {
  return { path, content, sizeBytes: content.length }
}

describe('buildAssessmentPrompt', () => {
  it('includes objective and repo path', () => {
    const result = buildAssessmentPrompt({
      objective: 'Understand auth flow',
      files: [],
      repoPath: '/repo',
    })
    expect(result).toContain('Objective: Understand auth flow')
    expect(result).toContain('Repository: /repo')
  })

  it('includes file headers and content', () => {
    const result = buildAssessmentPrompt({
      objective: 'test',
      files: [file('src/index.ts', 'export const x = 1')],
      repoPath: '/repo',
    })
    expect(result).toContain('--- src/index.ts ---')
    expect(result).toContain('export const x = 1')
  })

  it('includes closing instruction', () => {
    const result = buildAssessmentPrompt({ objective: 'test', files: [], repoPath: '/r' })
    expect(result).toContain('Provide a concise assessment')
  })

  it('truncates content to stay within maxChars', () => {
    const bigFile = file('big.ts', 'x'.repeat(10_000))
    const result = buildAssessmentPrompt({
      objective: 'test',
      files: [bigFile],
      repoPath: '/r',
      maxChars: 500,
    })
    expect(result.length).toBeLessThanOrEqual(600)
    expect(result).toContain('[truncated]')
  })

  it('distributes budget proportionally across multiple files', () => {
    const files = [
      file('a.ts', 'a'.repeat(5000)),
      file('b.ts', 'b'.repeat(5000)),
    ]
    const result = buildAssessmentPrompt({ objective: 'test', files, repoPath: '/r', maxChars: 1000 })
    expect(result).toContain('[truncated]')
    // both files present
    expect(result).toContain('--- a.ts ---')
    expect(result).toContain('--- b.ts ---')
  })

  it('handles zero files gracefully', () => {
    const result = buildAssessmentPrompt({ objective: 'empty', files: [], repoPath: '/r' })
    expect(result).toContain('Files reviewed: 0')
    expect(result).not.toContain('---')
  })
})
