import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { HostObservation, HostResourceType } from '@rohinik-org/compiler'
import type { HostDetector } from './host-detector.js'

const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 2000

export abstract class BinaryDetector implements HostDetector {
  abstract readonly name: string
  abstract readonly id: string
  abstract readonly resourceType: HostResourceType
  abstract readonly versionCommand: string[]

  protected async execWhich(): Promise<string | null> {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which'
      const { stdout } = await execFileAsync(cmd, [this.name], { timeout: TIMEOUT_MS })
      return stdout.trim().split('\n')[0]?.trim() ?? null
    } catch {
      return null
    }
  }

  protected async execVersion(executablePath: string): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(executablePath, this.versionCommand, { timeout: TIMEOUT_MS })
      return (stdout || stderr).trim().split('\n')[0] ?? ''
    } catch {
      return ''
    }
  }

  async detect(): Promise<HostObservation | null> {
    const now = new Date().toISOString()
    const executablePath = await this.execWhich()
    if (!executablePath) return null
    const versionRaw = await this.execVersion(executablePath)
    const obs: HostObservation = {
      name: this.name,
      executablePath,
      exitCode: 0,
      detectedAt: now,
    }
    if (versionRaw) {
      return { ...obs, versionRaw, rawOutput: versionRaw }
    }
    return obs
  }
}
