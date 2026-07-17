import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class GoDetector extends BinaryDetector {
  readonly name = 'go'
  readonly id = 'rohinik://host/go'
  readonly resourceType: HostResourceType = 'binary'
  readonly versionCommand = ['version']
}
