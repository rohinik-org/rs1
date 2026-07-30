import { RepositoryWriteConflict } from './types.js'

const PROHIBITED_KEYS = new Set(['password', 'secret', 'privateKey', 'credentials', 'token', 'apiKey'])

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortedReplacer(value))
}

function sortedReplacer(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RepositoryWriteConflict('command-validation-failure', `Non-finite number in canonical payload: ${value}`)
    return value
  }
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(sortedReplacer)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const result: Record<string, unknown> = {}
    for (const k of keys) {
      if (PROHIBITED_KEYS.has(k)) {
        throw new RepositoryWriteConflict('secret-field-rejected', `Prohibited field in canonical payload: ${k}`)
      }
      result[k] = sortedReplacer(obj[k])
    }
    return result
  }
  throw new RepositoryWriteConflict('command-validation-failure', `Unsupported value type in canonical payload: ${typeof value}`)
}
