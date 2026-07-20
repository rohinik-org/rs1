import { z } from 'zod'

const RoutingConfigSchema = z.object({
  mode: z.enum(['strict', 'fast', 'balanced', 'quality']).default('balanced'),
  explain: z.boolean().default(true),
  traceBuffer: z.number().int().min(1).default(5000),
})

const ResourcesConfigSchema = z.object({
  maxConcurrentRequests: z.number().int().min(1).default(500),
  timeoutMs: z.number().int().min(1).default(30000),
})

const RuntimeSectionSchema = z.object({
  routing: RoutingConfigSchema.default({}),
  resources: ResourcesConfigSchema.default({}),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  profile: z.enum(['balanced', 'fast', 'strict', 'quality', 'offline', 'developer']).optional(),
}).default({})

const ExtensionsSchema = z.object({
  paths: z.array(z.string()).default(['./extensions', 'node_modules/@aios']),
}).default({})

const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
})

const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(8080),
  host: z.string().default('0.0.0.0'),
}).default({})

const PersonaSchema = z.object({
  assistantName: z.string().optional(),
  organization: z.string().optional(),
  instructions: z.string().optional(),
}).optional()

export const AiosConfigSchema = z.object({
  version: z.string(),
  runtimeId: z.string().optional(),
  runtime: RuntimeSectionSchema,
  extensions: ExtensionsSchema,
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  memory: z.object({ provider: z.string().default('none') }).default({}),
  server: ServerConfigSchema,
  persona: PersonaSchema,
})

export type RawAiosConfig = z.input<typeof AiosConfigSchema>
export type ParsedAiosConfig = z.output<typeof AiosConfigSchema>
