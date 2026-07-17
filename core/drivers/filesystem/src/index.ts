import type { Runtime, SdkCapabilityMetadata } from '@rohinik-org/foundation'
import { ReadFileSkill } from './read.skill.js'
import { WriteFileSkill } from './write.skill.js'

const FS_METADATA: SdkCapabilityMetadata = {
  capabilityId: 'tool-filesystem',
  name: 'Filesystem Tool',
  version: '0.1.0',
  contractVersion: '1.0',
  description: 'Read and write files on the local filesystem',
  category: 'tool',
  tags: ['filesystem', 'read', 'write', 'local'],
  execution: { tierId: 'LOCAL_TOOL' },
}

export { ReadFileSkill, WriteFileSkill }

export function activate(runtime: Runtime): void {
  runtime.registerCapability({
    metadata: FS_METADATA,
    skills: [new ReadFileSkill(), new WriteFileSkill()],
  })
}
