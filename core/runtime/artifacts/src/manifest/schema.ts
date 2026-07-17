import { z } from 'zod'
import type { RohiniKPackageManifest } from '@rohinik-org/compiler'

const PublisherInfoSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  email: z.string().email().optional(),
  publicKey: z.string().optional(),
})

const PackageDependencySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  optional: z.boolean().optional(),
})

const ComplianceDeclarationSchema = z.object({
  targetLevel: z.number().int().min(0).max(6),
  laws: z.array(z.number().int().min(1).max(26)),
  benchmarkSuites: z.array(z.string()),
})

const TrustInfoSchema = z.object({
  publisher: PublisherInfoSchema,
  signature: z.string().optional(),
  contentHash: z.string().optional(),
  signedAt: z.string().optional(),
})

const MarketplaceMetadataSchema = z.object({
  category: z.string().min(1),
  tags: z.array(z.string()),
  homepage: z.string().url().optional(),
  repository: z.string().optional(),
  keywords: z.array(z.string()).optional(),
})

const EnterprisePolicySchema = z.object({
  allowedSources: z.array(z.string()).optional(),
  blockedIds: z.array(z.string()).optional(),
  requiredComplianceLevel: z.number().int().min(0).max(6).optional(),
  requireSignature: z.boolean().optional(),
  approvalRequired: z.boolean().optional(),
})

export const AiosPackageTypeEnum = z.enum([
  'adapter', 'capability', 'provider', 'memory',
  'compiler-frontend', 'shell', 'benchmark-suite', 'asset', 'pack',
])

export const AiosCompilerTargetEnum = z.enum([
  'capability', 'memory', 'agent', 'federation', 'shell', 'compiler-frontend', 'benchmark',
])

export const RohiniKAssetTypeEnum = z.enum([
  'claude-skill', 'cursor-rule', 'gemini-gem', 'copilot-instruction',
  'continue-config', 'prompt-bundle', 'generic-asset',
])

// rohinik://publisher/name — no version, no type encoded
const AiosPackageIdSchema = z
  .string()
  .regex(/^rohinik:\/\/[^/@]+\/[^/@]+$/, "packageId must be 'rohinik://publisher/name' (no version or type)")

export const RohiniKPackageManifestSchema = z.object({
  schemaVersion: z.literal('2.0'),
  id: z.string().min(1),
  packageId: AiosPackageIdSchema.optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must be semver'),
  type: AiosPackageTypeEnum,
  compilerTarget: AiosCompilerTargetEnum.optional(),
  assetType: RohiniKAssetTypeEnum.optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  author: PublisherInfoSchema.optional(),
  license: z.string().optional(),
  minimumRuntime: z.string().min(1),
  minimumSdk: z.string().min(1),
  dependencies: z.array(PackageDependencySchema).optional(),
  permissions: z.array(z.string()).optional(),
  compliance: ComplianceDeclarationSchema.optional(),
  trust: TrustInfoSchema.optional(),
  marketplace: MarketplaceMetadataSchema.optional(),
  enterprise: EnterprisePolicySchema.optional(),
})

export function validateManifest(raw: unknown): RohiniKPackageManifest {
  const result = RohiniKPackageManifestSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.errors[0]
    const path = first ? first.path.join('.') : '(root)'
    const msg = first ? first.message : 'validation failed'
    throw new Error(`Invalid rohinik-package.json at '${path}': ${msg}`)
  }
  return result.data as RohiniKPackageManifest
}
