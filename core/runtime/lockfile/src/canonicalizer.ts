// Recursive canonicalization of plain JSON values.
// UTF-16 ordinal key sorting (JS < operator, not localeCompare).

type PlainJson = null | string | boolean | number | PlainJson[] | { [k: string]: PlainJson }

export function canonicalize(value: unknown): unknown {
  return normalize(value, new Set())
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function normalize(value: unknown, seen: Set<object>): PlainJson {
  if (value === null) return null
  if (value === undefined) throw new TypeError('canonicalize: undefined is not allowed')
  const t = typeof value
  if (t === 'string' || t === 'boolean') return value as string | boolean
  if (t === 'number') {
    if (!isFinite(value as number)) throw new TypeError(`canonicalize: non-finite number ${value}`)
    return value as number
  }
  if (t !== 'object') throw new TypeError(`canonicalize: unsupported type '${t}'`)
  const obj = value as object
  if (seen.has(obj)) throw new TypeError('canonicalize: cyclic structure detected')
  seen.add(obj)
  try {
    if (Array.isArray(obj)) {
      return (obj as unknown[]).map(v => normalize(v, seen))
    }
    const proto = Object.getPrototypeOf(obj)
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(`canonicalize: non-plain object (${(obj as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'})`)
    }
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, normalize(v, seen)])
    ) as { [k: string]: PlainJson }
  } finally {
    seen.delete(obj)
  }
}
