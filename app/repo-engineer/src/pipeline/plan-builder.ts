import type { CollectedFile } from './file-collector.js'

export interface PlanPromptOptions {
  request: string
  files: CollectedFile[]
  repoPath: string
  maxChars?: number
}

export function buildPlanPrompt(opts: PlanPromptOptions): string {
  const maxChars = opts.maxChars ?? 8_000
  const header = [
    `Request: ${opts.request}`,
    `Repository: ${opts.repoPath}`,
    `Files reviewed: ${opts.files.length}`,
    '',
  ].join('\n')
  const footer = [
    '',
    'Provide a concrete, step-by-step implementation plan.',
    'Include: files to modify, functions to add/change, dependencies, test approach.',
    'Be specific and actionable.',
  ].join('\n')

  const reserved = header.length + footer.length
  const budget = Math.max(0, maxChars - reserved)

  if (opts.files.length === 0) {
    return header + footer
  }

  const perFile = Math.floor(budget / opts.files.length)

  const fileSections = opts.files.map((f) => {
    const truncated = f.content.length > perFile ? f.content.slice(0, perFile) + '\n...[truncated]' : f.content
    return `--- ${f.path} ---\n${truncated}`
  })

  return header + fileSections.join('\n\n') + footer
}
