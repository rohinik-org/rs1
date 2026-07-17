import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class DotnetDetector extends BinaryDetector {
  readonly name = 'dotnet'
  readonly id = 'rohinik://host/dotnet'
  readonly resourceType: HostResourceType = 'runtime'
  readonly versionCommand = ['--version']
}
