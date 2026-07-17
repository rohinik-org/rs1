import type { PromptRequest } from '@rohinik-org/compiler'

export class PromptBuilder {
  build(skillId: string, input: unknown, overrides?: { maxTokens?: number; temperature?: number }): PromptRequest {
    return {
      kind: 'PromptRequest',
      skillId,
      input,
      systemPrompt: `You are an AI assistant executing the skill: ${skillId}`,
      userMessage: input === null || input === undefined ? '' : typeof input === 'string' ? input : JSON.stringify(input),
      ...(overrides?.maxTokens !== undefined ? { maxTokens: overrides.maxTokens } : {}),
      ...(overrides?.temperature !== undefined ? { temperature: overrides.temperature } : {}),
    }
  }
}
