import { CanonicalSerializerError, CanonicalParserError } from '@rohinik-org/capability-contracts-ir'
import type { JsonValue } from '@rohinik-org/capability-contracts-ir'

// §7 — canonicalStringify: deterministic JSON with lexicographically sorted keys.
export function canonicalStringify(value: JsonValue): string {
  return ser(value)
}

function ser(value: unknown): string {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'boolean') return value ? 'true' : 'false'
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new CanonicalSerializerError(`Non-finite number is not serializable: ${String(value)}`)
    }
    return JSON.stringify(value)
  }
  if (t === 'string') return JSON.stringify(value)
  if (t === 'bigint') throw new CanonicalSerializerError('BigInt is not serializable')
  if (t === 'undefined') throw new CanonicalSerializerError('undefined is not a JsonValue')
  if (t === 'function' || t === 'symbol') throw new CanonicalSerializerError(`${t} is not serializable`)
  if (Array.isArray(value)) return '[' + value.map(ser).join(',') + ']'
  // object: reject non-plain (Date/Map/Set/RegExp/class instances)
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'
    throw new CanonicalSerializerError(`Non-plain object is not serializable: ${name}`)
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + ser(obj[k])).join(',') + '}'
}

// §7 — deserializeCanonicalJson: parse with duplicate-key rejection.
// V8 collapses duplicate keys before a reviver sees them, so we pre-scan the text
// with a minimal tokenizer to detect duplicate keys per object.
// ponytail: hand-rolled scanner because JSON.parse can't report dup keys; no dep for this.
export function deserializeCanonicalJson(text: string): JsonValue {
  detectDuplicateKeys(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new CanonicalParserError('PARSE_FAILURE', (e as Error).message)
  }
  return parsed as JsonValue
}

interface Frame {
  readonly isObject: boolean
  readonly keys: Set<string>
  expectingKey: boolean
}

function detectDuplicateKeys(text: string): void {
  const stack: Frame[] = []
  let i = 0
  const n = text.length

  const top = (): Frame | undefined => (stack.length > 0 ? stack[stack.length - 1] : undefined)

  const readString = (): string => {
    let s = ''
    i++ // opening quote
    while (i < n) {
      const c = text[i]
      if (c === '\\') {
        const nx = text[i + 1]
        if (nx === 'u') {
          const hex = text.slice(i + 2, i + 6)
          s += String.fromCharCode(parseInt(hex, 16))
          i += 6
        } else {
          const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
          s += (nx !== undefined ? map[nx] ?? nx : '')
          i += 2
        }
      } else if (c === '"') {
        i++ // closing quote
        return s
      } else {
        s += c
        i++
      }
    }
    throw new CanonicalParserError('PARSE_FAILURE', 'Unterminated string')
  }

  while (i < n) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    if (c === '{') {
      stack.push({ isObject: true, keys: new Set(), expectingKey: true })
      i++
    } else if (c === '[') {
      stack.push({ isObject: false, keys: new Set(), expectingKey: false })
      i++
    } else if (c === '}' || c === ']') {
      stack.pop()
      i++
    } else if (c === '"') {
      const frame = top()
      const isKey = frame !== undefined && frame.isObject && frame.expectingKey
      const str = readString()
      if (frame !== undefined && isKey) {
        if (frame.keys.has(str)) {
          throw new CanonicalParserError('DUPLICATE_OBJECT_KEY', `Duplicate key: '${str}'`)
        }
        frame.keys.add(str)
        frame.expectingKey = false
      }
    } else if (c === ':') {
      i++
    } else if (c === ',') {
      const frame = top()
      if (frame !== undefined && frame.isObject) frame.expectingKey = true
      i++
    } else {
      i++ // primitive literal char
    }
  }
}
