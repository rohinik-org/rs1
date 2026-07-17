import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class NodeDetector extends BinaryDetector {
  readonly name = 'node'
  readonly id = 'rohinik://host/node'
  readonly resourceType: HostResourceType = 'binary'
  readonly versionCommand = ['--version']
}
