import type { CollectedFile } from './file-collector.js'
import type { PlanArtifact } from './plan-store.js'

export interface PatchPromptOptions {
  plan: PlanArtifact
  files: CollectedFile[]
  repoPath: string
}

export function buildPatchPrompt(opts: PatchPromptOptions): string {
  const { plan, files, repoPath } = opts

  const fileBlocks = files.map(f => {
    const truncated = f.content.length > 4_000
      ? f.content.slice(0, 4_000) + '\n... [truncated]'
      : f.content
    return `### ${f.path}\n\`\`\`\n${truncated}\n\`\`\``
  }).join('\n\n')

  return `You are a precise code editor. You will produce a unified diff patch that implements the plan below.

## Repository
${repoPath}

## Implementation Plan
${plan.content}

## Relevant Files
${fileBlocks}

## Instructions

Produce ONLY a unified diff in standard \`git diff\` format. Rules:
- Start each file diff with \`diff --git a/<path> b/<path>\`
- Include \`--- a/<path>\` and \`+++ b/<path>\` headers
- Include hunk headers \`@@ -L,N +L,N @@\`
- Lines starting with \`+\` are additions, \`-\` are deletions, space is context
- No explanatory prose before or after the diff
- If creating a new file: use \`--- /dev/null\` and \`+++ b/<path>\`
- If no changes are needed for a file: omit it entirely
- Produce the minimal diff that correctly implements the plan

Output the raw diff only. Do not wrap in markdown code fences.`
}
