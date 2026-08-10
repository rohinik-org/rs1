/**
 * ROHINIK_HOME filesystem contract.
 *
 * All mutable runtime state lives under ROHINIK_HOME. The layout is fixed:
 * runtime upgrades must never overwrite config/, secrets/, or state/.
 *
 * Resolution order:
 *   1. ROHINIK_HOME env var (explicit override)
 *   2. Platform default:
 *      - win32:  %LOCALAPPDATA%\Rohinik
 *      - darwin: ~/Library/Application Support/Rohinik
 *      - linux:  ~/.local/share/rohinik  (XDG_DATA_HOME if set)
 *
 * Separation contract (constitutional, never violate):
 *
 *   runtimes/   — installed runtime versions (immutable after install)
 *   config/     — operator-managed config files (never overwritten by upgrade)
 *   state/      — mutable runtime state: PID files, socket paths, session info
 *   packages/   — installed .rpk packages
 *   cache/      — download cache, temp files (safe to delete)
 *   logs/       — log files (rotated, never rotated away by upgrade)
 *   secrets/    — (future) secret files; separate from config to enable tighter ACLs
 */

import { join } from 'node:path'
import { homedir, platform } from 'node:os'

export interface RohinikHome {
  /** Root ROHINIK_HOME directory. */
  root:     string
  /** ROHINIK_HOME/runtimes/<version>/ — versioned runtime installs. */
  runtimes: string
  /** ROHINIK_HOME/config/ — operator config files, never overwritten by upgrade. */
  config:   string
  /** ROHINIK_HOME/state/ — PID, socket, session. */
  state:    string
  /** ROHINIK_HOME/packages/ — installed .rpk packages. */
  packages: string
  /** ROHINIK_HOME/cache/ — safe to wipe. */
  cache:    string
  /** ROHINIK_HOME/logs/ */
  logs:     string
}

function defaultRoot(): string {
  const env = process.env['ROHINIK_HOME']
  if (env) return env

  const os = platform()
  if (os === 'win32') {
    const localAppData = process.env['LOCALAPPDATA']
    if (localAppData) return join(localAppData, 'Rohinik')
    return join(homedir(), 'AppData', 'Local', 'Rohinik')
  }
  if (os === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Rohinik')
  }
  // Linux / other — respect XDG_DATA_HOME
  const xdg = process.env['XDG_DATA_HOME']
  return xdg ? join(xdg, 'rohinik') : join(homedir(), '.local', 'share', 'rohinik')
}

/** Resolve all ROHINIK_HOME subdirectory paths. */
export function resolveHome(root?: string): RohinikHome {
  const r = root ?? defaultRoot()
  return {
    root:     r,
    runtimes: join(r, 'runtimes'),
    config:   join(r, 'config'),
    state:    join(r, 'state'),
    packages: join(r, 'packages'),
    cache:    join(r, 'cache'),
    logs:     join(r, 'logs'),
  }
}

/** Path to the manifest file for a specific runtime version. */
export function manifestPath(home: RohinikHome, version: string): string {
  return join(home.runtimes, version, 'rohinik-manifest.json')
}

/** Path to the runtime entrypoint script for a specific version. */
export function runtimeEntrypoint(home: RohinikHome, version: string, entrypoint: string): string {
  return join(home.runtimes, version, entrypoint)
}
