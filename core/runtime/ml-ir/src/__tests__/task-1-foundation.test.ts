import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// __tests__ is src/__tests__, so pkg root is two levels up
const pkgRoot = resolve(__dirname, '../..')
// workspace root is three more levels: ml-ir -> runtime -> core -> workspace
const workspaceRoot = resolve(pkgRoot, '../../..')

describe('INV-12A-001: package name', () => {
  it('is exactly @rohinik-org/ml-ir', () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as { name: string }
    expect(pkg.name).toBe('@rohinik-org/ml-ir')
  })
})

describe('INV-12A-002: no second ML IR package', () => {
  it('workspace has exactly one ml-ir package', () => {
    const ws = readFileSync(resolve(workspaceRoot, 'pnpm-workspace.yaml'), 'utf-8')
    const matches = ws.match(/ml-ir/g) ?? []
    expect(matches.length).toBe(1)
  })
})

describe('INV-12A-003: no forbidden dependencies', () => {
  it('has no framework or cloud ML SDK dependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const forbidden = [
      'torch', 'tensorflow', '@tensorflow', 'onnxruntime', 'onnx-runtime',
      'scikit-learn', 'xgboost', 'mlflow', '@google-cloud/aiplatform',
      '@aws-sdk/client-sagemaker', '@azure/ai-ml', 'kubeflow',
    ]
    const all = Object.keys({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    })
    for (const dep of all) {
      expect(forbidden.some(f => dep.includes(f))).toBe(false)
    }
  })
})

describe('root export', () => {
  it('loads without error', async () => {
    const mod = await import('../../src/index.js')
    expect(mod).toBeDefined()
  })
})

describe('JSON-safe primitive types', () => {
  it('JsonPrimitive excludes undefined, bigint, symbols, functions', async () => {
    const { isJsonPrimitive } = await import('../../src/index.js')
    expect(isJsonPrimitive(null)).toBe(true)
    expect(isJsonPrimitive(42)).toBe(true)
    expect(isJsonPrimitive('hi')).toBe(true)
    expect(isJsonPrimitive(true)).toBe(true)
    expect(isJsonPrimitive(undefined)).toBe(false)
    expect(isJsonPrimitive(42n)).toBe(false)
    expect(isJsonPrimitive(Symbol())).toBe(false)
    expect(isJsonPrimitive(() => {})).toBe(false)
  })

  it('isJsonValue rejects class instances, Map, Set, Date', async () => {
    const { isJsonValue } = await import('../../src/index.js')
    expect(isJsonValue({ a: 1, b: [2, 3] })).toBe(true)
    expect(isJsonValue([1, null, 'x'])).toBe(true)
    expect(isJsonValue(new Map())).toBe(false)
    expect(isJsonValue(new Set())).toBe(false)
    expect(isJsonValue(new Date())).toBe(false)
    class Foo {}
    expect(isJsonValue(new Foo())).toBe(false)
  })

  it('isJsonValue rejects sparse arrays', async () => {
    const { isJsonValue } = await import('../../src/index.js')
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [1, , 3]
    expect(isJsonValue(sparse)).toBe(false)
  })

  it('isJsonValue rejects bigint values nested in objects', async () => {
    const { isJsonValue } = await import('../../src/index.js')
    expect(isJsonValue({ x: 42n })).toBe(false)
  })

  it('isJsonValue accepts null and nested nulls', async () => {
    const { isJsonValue } = await import('../../src/index.js')
    expect(isJsonValue(null)).toBe(true)
    expect(isJsonValue({ a: null, b: [null] })).toBe(true)
  })
})
