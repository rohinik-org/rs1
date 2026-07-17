import type { HostResourceType } from '@rohinik-org/compiler'
import { BinaryDetector } from '../binary-detector.js'
export class CudaDetector extends BinaryDetector {
  readonly name = 'nvidia-smi'
  readonly id = 'rohinik://host/cuda'
  readonly resourceType: HostResourceType = 'runtime'
  readonly versionCommand = ['--version']
}
