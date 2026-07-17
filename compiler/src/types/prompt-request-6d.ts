export interface PromptRequest {
  readonly kind: 'PromptRequest'
  readonly skillId: string
  readonly input: unknown
  readonly systemPrompt?: string
  readonly userMessage: string
  readonly examples?: readonly { input: string; output: string }[]
  readonly maxTokens?: number
  readonly temperature?: number
}
