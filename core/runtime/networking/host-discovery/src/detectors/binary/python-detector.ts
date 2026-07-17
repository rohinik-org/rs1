import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class PythonDetector extends BinaryDetector {
  readonly name = 'python'
  readonly id = 'rohinik://host/python'
  readonly resourceType: HostResourceType = 'binary'
  readonly versionCommand = ['--version']
}
