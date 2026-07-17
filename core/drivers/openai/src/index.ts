import type { Runtime } from '@rohinik-org/foundation'
import { OpenAIProvider } from './openai.provider.js'

export { OpenAIProvider }
export type { OpenAIConfig } from './openai.provider.js'

export function activate(runtime: Runtime): void {
  const apiKey = process.env['OPENAI_API_KEY'] ?? ''
  runtime.registerProvider(new OpenAIProvider({ apiKey }))
}
