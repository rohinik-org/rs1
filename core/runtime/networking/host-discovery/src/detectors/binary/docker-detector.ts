import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class DockerDetector extends BinaryDetector {
  readonly name = 'docker'
  readonly id = 'rohinik://host/docker'
  readonly resourceType: HostResourceType = 'container'
  readonly versionCommand = ['--version']
}
