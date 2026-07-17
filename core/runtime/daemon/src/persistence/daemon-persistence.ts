import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { platform } from 'node:process'
import type { RuntimeSession } from '@rohinik-org/compiler'

export class DaemonPersistence {
  private readonly runtimeDir: string

  constructor(baseDir = '.rohinik') {
    this.runtimeDir = baseDir
  }

  socketPath(sessionId: string): string {
    if (platform === 'win32') {
      return `\\\\.\\pipe\\rhkd-${sessionId}`
    }
    return join(this.runtimeDir, 'sockets', 'rhkd.sock')
  }

  private pidFile(): string { return join(this.runtimeDir, 'daemon.pid') }
  private sessionFile(): string { return join(this.runtimeDir, 'daemon.json') }

  private ensureDir(): void {
    if (!existsSync(this.runtimeDir)) mkdirSync(this.runtimeDir, { recursive: true })
  }

  writePid(pid: number): void {
    this.ensureDir()
    writeFileSync(this.pidFile(), String(pid), 'utf8')
  }

  readPid(): number | undefined {
    try {
      return parseInt(readFileSync(this.pidFile(), 'utf8').trim(), 10)
    } catch { return undefined }
  }

  removePid(): void {
    try { unlinkSync(this.pidFile()) } catch { /* already gone */ }
  }

  writeSession(session: RuntimeSession): void {
    this.ensureDir()
    writeFileSync(this.sessionFile(), JSON.stringify(session, null, 2), 'utf8')
  }

  readSession(): RuntimeSession | undefined {
    try {
      return JSON.parse(readFileSync(this.sessionFile(), 'utf8')) as RuntimeSession
    } catch { return undefined }
  }

  removeSession(): void {
    try { unlinkSync(this.sessionFile()) } catch { /* already gone */ }
  }

  isRunning(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch { return false }
  }
}
