import type { Runtime } from '@rohinik-org/foundation'
import { NullReasoningProvider } from './null-reasoning.provider.js'

export { NullReasoningProvider }

export function activate(runtime: Runtime): void {
  runtime.registerProvider(new NullReasoningProvider())
}
