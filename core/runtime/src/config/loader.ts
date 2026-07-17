import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yaml from 'js-yaml'
import { v4 as uuidv4 } from 'uuid'
import { AiosConfigSchema } from './schema.js'
import type { ResolvedConfig } from '../types.js'

function substituteEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    const value = process.env[varName]
    if (value === undefined) {
      throw new Error(`Config error: environment variable '${varName}' is not set`)
    }
    return value
  })
}

export async function loadConfig(configPath: string): Promise<ResolvedConfig> {
  const absolutePath = resolve(configPath)
  const rawText = readFileSync(absolutePath, 'utf-8')
  const substituted = substituteEnvVars(rawText)
  const parsed = yaml.load(substituted)

  const result = AiosConfigSchema.safeParse(parsed)
  if (!result.success) {
    const firstError = result.error.errors[0]!
    const fieldPath = firstError.path.join('.')
    throw new Error(`Config error: ${fieldPath} — ${firstError.message}`)
  }

  const data = result.data
  return {
    configPath: absolutePath,
    runtimeId: data.runtimeId ?? uuidv4(),
    runtime: {
      routing: {
        mode: data.runtime.routing.mode,
        explain: data.runtime.routing.explain,
        traceBuffer: data.runtime.routing.traceBuffer,
      },
      resources: {
        maxConcurrentRequests: data.runtime.resources.maxConcurrentRequests,
        timeoutMs: data.runtime.resources.timeoutMs,
      },
      logLevel: data.runtime.logLevel,
    },
    extensions: {
      paths: data.extensions.paths,
    },
    providers: Object.fromEntries(
      Object.entries(data.providers).map(([k, v]) => [k, {
        ...(v.apiKey !== undefined && { apiKey: v.apiKey }),
        ...(v.baseUrl !== undefined && { baseUrl: v.baseUrl }),
      }])
    ),
    server: {
      port: data.server.port,
      host: data.server.host,
    },
  }
}
