import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class VSCodeDetector extends BinaryDetector {
  readonly name = 'code'
  readonly id = 'rohinik://host/vscode'
  readonly resourceType: HostResourceType = 'ide'
  readonly versionCommand = ['--version']
}
