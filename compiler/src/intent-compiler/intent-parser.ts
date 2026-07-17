import type { CompilerContext } from '../types/compiler-context.js'
import type { IntentCandidate } from './intent-candidate.js'

export interface LLMClient {
  complete(systemPrompt: string, userPrompt: string): Promise<string>
}

export class AnthropicLLMClient implements LLMClient {
  constructor(private readonly apiKey: string, private readonly model = 'claude-haiku-4-5-20251001') {}

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: this.apiKey })
    const response = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const content = response.content[0]
    if (!content || content.type !== 'text') {
      throw new Error('IntentParser: LLM returned no text content')
    }
    return content.text
  }
}

const SYSTEM_PROMPT = `You are an intent parser for the Rohinik Runtime. Extract structured intent from user requests.

Return ONLY valid JSON in this exact shape (no markdown, no explanation):
{
  "action": "string — the main verb (organize, delete, sort, find, transform, read, write)",
  "object": "string — what the action applies to (files, downloads, data, the report)",
  "desiredState": "string or null — the desired end state if mentioned",
  "entities": [
    { "name": "entity_name", "rawValue": "the raw text", "inferredType": "path|file|directory|data|value|reference" }
  ],
  "constraints": [
    { "type": "preserve|exclude|require|prefer|limit", "target": "what to preserve/exclude/etc", "value": null }
  ],
  "confidence": 0.0
}

Rules:
- confidence is 0.0–1.0; reflect how certain you are about the interpretation
- If you cannot extract a clear goal, set action to "unknown" and confidence below 0.5
- entities are things in the user's environment (files, folders, data)
- constraints limit or shape execution (preserve originals, don't delete, use fastest approach)`

export class IntentParser {
  constructor(private readonly llm: LLMClient) {}

  async parse(input: string, ctx: CompilerContext): Promise<IntentCandidate> {
    const contextHints = this.buildContextHints(ctx)
    const userPrompt = contextHints
      ? `Context:\n${contextHints}\n\nUser request: ${input}`
      : `User request: ${input}`

    const raw = await this.llm.complete(SYSTEM_PROMPT, userPrompt)
    return this.parseResponse(raw, input)
  }

  private buildContextHints(ctx: CompilerContext): string {
    const hints: string[] = []
    const bindings = ctx.session.bindings
    if (Object.keys(bindings).length > 0) {
      hints.push(`Active bindings: ${JSON.stringify(bindings)}`)
    }
    const skills = ctx.system.capabilities.skills.map(s => s.skillId).join(', ')
    if (skills) hints.push(`Available skills: ${skills}`)
    return hints.join('\n')
  }

  private parseResponse(raw: string, originalInput: string): IntentCandidate {
    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(cleaned) as {
        action?: string; object?: string; desiredState?: string
        entities?: Array<{ name: string; rawValue: string; inferredType?: string }>
        constraints?: Array<{ type?: string; target: string; value?: unknown }>
        confidence?: number
      }
      return {
        rawText: originalInput,
        parsedGoal: {
          action: parsed.action ?? 'unknown',
          ...(parsed.object != null ? { object: parsed.object } : {}),
          ...(parsed.desiredState != null ? { desiredState: parsed.desiredState } : {}),
        },
        parsedEntities: parsed.entities ?? [],
        parsedConstraints: parsed.constraints ?? [],
        rawConfidence: parsed.confidence ?? 0.5,
      }
    } catch {
      return {
        rawText: originalInput,
        rawConfidence: 0,
        parseWarnings: [`Failed to parse LLM response: ${raw.slice(0, 200)}`],
      }
    }
  }
}
