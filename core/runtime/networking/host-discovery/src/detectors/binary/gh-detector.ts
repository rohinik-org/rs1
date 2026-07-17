import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class GhDetector extends BinaryDetector {
  readonly name = 'gh'
  readonly id = 'rohinik://host/gh'
  readonly resourceType: HostResourceType = 'binary'
  readonly versionCommand = ['--version']
}
