import type {
  PackageEnvironmentInspector,
  ProviderEnvironmentInspector,
  DependencyEnvironmentInspector,
  ModelEnvironmentInspector,
  InfrastructureEnvironmentInspector,
  ConfigurationEnvironmentInspector,
  RuntimeEnvironmentInspector,
  ObservedRuntimeEnvironment,
  ObservedPackage,
  ObservedProvider,
  ObservedDependencyEnvironment,
  ObservedModel,
  ObservedInfrastructure,
  ObservedConfiguration,
  ObservedNpmEnvironment,
  ObservedNpmPackage,
} from '@rohinik-org/lockfile-ir'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import * as process from 'node:process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function npmVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('npm', ['--version'], { timeout: 5000 })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

async function readJsonFile(path: string): Promise<unknown | undefined> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export class WorkspaceInspectors {
  constructor(private readonly workspaceRoot: string) {}

  runtimeInspector(): RuntimeEnvironmentInspector {
    return {
      inspectRuntime: async (): Promise<ObservedRuntimeEnvironment> => {
        const npmVer = await npmVersion()
        const runtime: ObservedRuntimeEnvironment = {
          os: process.platform,
          architecture: process.arch,
          runtimeKind: 'nodejs',
          runtimeVersion: process.version,
          runtimeAbi: process.versions.modules,
          // ponytail: libc not exposed by Node; would need native binding or /proc/version
        }
        if (npmVer !== undefined) {
          (runtime as { packageManager?: { kind: 'npm'; version: string } }).packageManager = { kind: 'npm', version: npmVer }
        }
        return runtime
      },
    }
  }

  // ponytail: empty stubs — no package/provider/model/infrastructure/config store without 9H context
  packageInspector(): PackageEnvironmentInspector {
    return { inspectPackages: async (): Promise<readonly ObservedPackage[]> => [] }
  }

  providerInspector(): ProviderEnvironmentInspector {
    return { inspectProviders: async (): Promise<readonly ObservedProvider[]> => [] }
  }

  modelInspector(): ModelEnvironmentInspector {
    return { inspectModels: async (): Promise<readonly ObservedModel[]> => [] }
  }

  infrastructureInspector(): InfrastructureEnvironmentInspector {
    return { inspectInfrastructure: async (): Promise<readonly ObservedInfrastructure[]> => [] }
  }

  configurationInspector(): ConfigurationEnvironmentInspector {
    return { inspectConfiguration: async (): Promise<readonly ObservedConfiguration[]> => [] }
  }

  dependencyInspector(): DependencyEnvironmentInspector {
    const root = this.workspaceRoot
    return {
      inspectDependencies: async (): Promise<ObservedDependencyEnvironment> => {
        const lockRaw = await readJsonFile(join(root, 'package-lock.json'))
        if (lockRaw === null || typeof lockRaw !== 'object' || Array.isArray(lockRaw)) {
          return {}
        }
        const lock = lockRaw as Record<string, unknown>
        const pkgsRaw = lock['packages']
        if (pkgsRaw === null || typeof pkgsRaw !== 'object' || Array.isArray(pkgsRaw)) {
          return { npm: emptyNpm() }
        }
        const pkgsMap = pkgsRaw as Record<string, unknown>
        const packages: ObservedNpmPackage[] = Object.entries(pkgsMap).map(([pkgPath, pkgData]) => {
          const d = (pkgData !== null && typeof pkgData === 'object' && !Array.isArray(pkgData))
            ? pkgData as Record<string, unknown>
            : {}
          const pkg: ObservedNpmPackage = { packagePath: pkgPath }
          if (typeof d['name'] === 'string') (pkg as { name?: string }).name = d['name']
          if (typeof d['version'] === 'string') (pkg as { version?: string }).version = d['version']
          if (typeof d['integrity'] === 'string') {
            // SRI format: sha512-<base64>
            const intStr = d['integrity'] as string
            ;(pkg as { integrity?: { algorithm: 'sha512'; encoding: 'sri-base64'; value: string } }).integrity = {
              algorithm: 'sha512',
              encoding: 'sri-base64',
              value: intStr,
            }
          }
          return pkg
        })
        const npm: ObservedNpmEnvironment = { packages }
        if (typeof lock['lockfileVersion'] === 'number') {
          (npm as { lockfileVersion?: number }).lockfileVersion = lock['lockfileVersion'] as number
        }
        return { npm }
      },
    }
  }
}

function emptyNpm(): ObservedNpmEnvironment {
  return { packages: [] }
}
