import { createHash } from 'node:crypto'

type PlainJson = null | string | boolean | number | PlainJson[] | { [k: string]: PlainJson }

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value, new WeakSet()))
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function normalize(value: unknown, seen: WeakSet<object>): PlainJson {
  if (value === null) return null
  const t = typeof value
  if (t === 'string' || t === 'boolean') return value as string | boolean
  if (t === 'number') {
    if (!isFinite(value as number)) throw new TypeError(`canonicalize: non-finite number ${value}`)
    return value as number
  }
  if (t !== 'object') {
    throw new TypeError(`canonicalize: unsupported type '${t}'`)
  }
  if (seen.has(value as object)) throw new TypeError('canonicalize: cyclic structure')
  seen.add(value as object)
  if (Array.isArray(value)) {
    const result = (value as unknown[]).map(v => normalize(v, seen))
    seen.delete(value as object)
    return result
  }
  // Reject non-plain-object prototypes
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(`canonicalize: non-plain object (${(value as object).constructor?.name ?? 'unknown'})`)
  }
  const result = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))   // code-unit ordering, not localeCompare
      .map(([k, v]) => [k, normalize(v, seen)])
  ) as { [k: string]: PlainJson }
  seen.delete(value as object)
  return result
}
