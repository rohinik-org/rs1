import type { Runtime } from '@rohinik-org/foundation'
import { AnthropicProvider } from './anthropic.provider.js'

export { AnthropicProvider }
export type { AnthropicConfig } from './anthropic.provider.js'

export function activate(runtime: Runtime): void {
  const apiKey = process.env['ANTHROPIC_API_KEY'] ?? ''
  runtime.registerProvider(new AnthropicProvider({ apiKey }))
}
