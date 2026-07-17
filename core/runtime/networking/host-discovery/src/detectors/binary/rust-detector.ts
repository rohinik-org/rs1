import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class RustDetector extends BinaryDetector {
  readonly name = 'rustc'
  readonly id = 'rohinik://host/rust'
  readonly resourceType: HostResourceType = 'binary'
  readonly versionCommand = ['--version']
}
