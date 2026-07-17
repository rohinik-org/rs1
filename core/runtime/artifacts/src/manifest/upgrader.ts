import type { RohiniKPackageManifest } from '@rohinik-org/compiler'

interface V1Manifest {
  schemaVersion?: string
  id: string
  version: string
  protocol?: string
  minimumRuntime?: string
  minimumSdk?: string
  dependencies?: string[]
  permissions?: string[]
  compliance?: { targetLevel?: number; laws?: number[]; benchmarkSuites?: string[] }
  description?: string
  author?: string
  license?: string
}

// Derive a canonical rohinik://publisher/name URI from a legacy npm-style id.
// '@org/name' → 'rohinik://org/name'
// 'name'      → 'rohinik://aios/name'  (no org → default publisher 'aios')
function derivePackageId(id: string): string {
  const stripped = id.startsWith('@') ? id.slice(1) : id
  const parts = stripped.split('/')
  if (parts.length >= 2) {
    return `rohinik://${parts[0]}/${parts.slice(1).join('/')}`
  }
  return `rohinik://aios/${stripped}`
}

export function upgradeManifest(raw: unknown): RohiniKPackageManifest {
  const v1 = raw as V1Manifest
  if ((raw as { schemaVersion?: string }).schemaVersion === '2.0') {
    return raw as RohiniKPackageManifest
  }
  return {
    schemaVersion: '2.0',
    id: v1.id,
    packageId: derivePackageId(v1.id),
    version: v1.version,
    type: 'adapter',
    name: v1.id.split('/').pop() ?? v1.id,
    description: v1.description ?? '',
    minimumRuntime: v1.minimumRuntime ?? '>=0.1.0',
    minimumSdk: v1.minimumSdk ?? '1.0',
    ...(v1.permissions ? { permissions: v1.permissions } : {}),
    ...(v1.license ? { license: v1.license } : {}),
    ...(v1.author ? { author: { name: v1.author } } : {}),
    ...(v1.dependencies && v1.dependencies.length > 0
      ? { dependencies: v1.dependencies.map(d => ({ id: d, version: '*' })) }
      : {}),
    ...(v1.compliance
      ? {
          compliance: {
            targetLevel: v1.compliance.targetLevel ?? 0,
            laws: v1.compliance.laws ?? [],
            benchmarkSuites: v1.compliance.benchmarkSuites ?? [],
          },
        }
      : {}),
  }
}
