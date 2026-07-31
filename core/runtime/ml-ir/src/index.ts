export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  if (value === null) return true
  const t = typeof value
  return t === 'string' || t === 'number' || t === 'boolean'
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (isJsonPrimitive(value)) return true
  if (Array.isArray(value)) {
    if (value.length !== Object.keys(value).length) return false // sparse
    return value.every(isJsonValue)
  }
  if (typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value) as unknown
  if (proto !== Object.prototype && proto !== null) return false
  return Object.values(value as Record<string, unknown>).every(isJsonValue)
}
