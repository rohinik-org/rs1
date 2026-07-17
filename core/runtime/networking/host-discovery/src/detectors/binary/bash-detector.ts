import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class BashDetector extends BinaryDetector {
  readonly name = 'bash'
  readonly id = 'rohinik://host/bash'
  readonly resourceType: HostResourceType = 'shell'
  readonly versionCommand = ['--version']
}
