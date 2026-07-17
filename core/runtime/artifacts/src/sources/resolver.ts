import type { RohiniKPackageManifest } from '@rohinik-org/compiler'

export interface ResolvedPackage {
  readonly localPath: string
  readonly manifest: RohiniKPackageManifest
  readonly contentHash: string
}

export interface SourceResolver {
  readonly scheme: string
  resolve(location: string, tempDir: string): Promise<ResolvedPackage>
}
