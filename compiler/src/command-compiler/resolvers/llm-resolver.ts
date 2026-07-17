import type { CommandResolution } from '../../types/command-ir.js'

export class LlmResolver {
  async resolve(rawInput: string): Promise<{ resolution: CommandResolution; action: string; target?: string; confidence: number }> {
    // v1: deterministic fallback — suggest search
    const words = rawInput.split(' ').filter(w => w.length > 3)
    const target = words[0]
    return {
      action: 'search',
      ...(target !== undefined ? { target } : {}),
      confidence: 0.3,
      resolution: { source: 'llm', explanation: `Could not deterministically resolve "${rawInput}". Suggesting search.` },
    }
  }
}
