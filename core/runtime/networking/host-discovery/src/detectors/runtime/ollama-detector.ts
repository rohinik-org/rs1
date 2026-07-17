import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class OllamaDetector extends BinaryDetector {
  readonly name = 'ollama'
  readonly id = 'rohinik://host/ollama'
  readonly resourceType: HostResourceType = 'runtime'
  readonly versionCommand = ['--version']
}
