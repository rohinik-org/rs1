import { homedir } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:process'

export interface ExperienceStoreConfig {
  readonly dbPath: string
}

export function resolveExperienceStoreConfig(dataDir?: string): ExperienceStoreConfig {
  if (dataDir) {
    return { dbPath: join(dataDir, 'experience', 'experience.db') }
  }
  let base: string
  if (platform === 'win32') {
    base = join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'Rohinik')
  } else if (platform === 'darwin') {
    base = join(homedir(), 'Library', 'Application Support', 'Rohinik')
  } else {
    base = join(homedir(), '.local', 'share', 'rohinik')
  }
  return { dbPath: join(base, 'experience', 'experience.db') }
}
