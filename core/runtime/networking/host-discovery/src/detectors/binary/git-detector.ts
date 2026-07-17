import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class GitDetector extends BinaryDetector {
  readonly name = 'git'
  readonly id = 'rohinik://host/git'
  readonly resourceType: HostResourceType = 'binary'
  readonly versionCommand = ['--version']
}
