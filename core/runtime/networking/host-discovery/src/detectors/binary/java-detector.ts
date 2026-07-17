import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class JavaDetector extends BinaryDetector {
  readonly name = 'java'
  readonly id = 'rohinik://host/java'
  readonly resourceType: HostResourceType = 'runtime'
  readonly versionCommand = ['-version']
}
