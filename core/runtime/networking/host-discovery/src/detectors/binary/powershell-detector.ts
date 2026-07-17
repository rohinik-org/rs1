import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class PowerShellDetector extends BinaryDetector {
  readonly name = process.platform === 'win32' ? 'powershell' : 'pwsh'
  readonly id = 'rohinik://host/powershell'
  readonly resourceType: HostResourceType = 'shell'
  readonly versionCommand = ['-version']
}
