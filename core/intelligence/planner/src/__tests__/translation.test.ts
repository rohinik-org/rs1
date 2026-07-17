import { describe, it, expect } from 'vitest'
import { StaticIntentTranslator } from '../translation/static-intent-translator.js'
import { RecordedIntentTranslator } from '../translation/recorded-intent-translator.js'
import { CompositeIntentTranslator } from '../translation/composite-intent-translator.js'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('StaticIntentTranslator', () => {
  it('returns SUCCESS for exact-match input', async () => {
    const t = new StaticIntentTranslator([
      { input: 'read csv', concepts: ['read'], preferredSkills: ['skill-csv'] },
    ])
    const result = await t.translate({ input: 'read csv' })
    expect(result.status).toBe('SUCCESS')
    expect(result.intent.concepts).toEqual(['read'])
    expect(result.intent.translatedBy).toBe('StaticIntentTranslator')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('returns DECLINED for unknown input', async () => {
    const t = new StaticIntentTranslator([])
    const result = await t.translate({ input: 'unknown phrase' })
    expect(result.status).toBe('DECLINED')
  })
})

describe('RecordedIntentTranslator', () => {
  it('loads fixture and returns SUCCESS', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aios-planner-test-'))
    await mkdir(join(dir, '.aios', 'intents'), { recursive: true })
    const fixture = {
      intentId: 'intent-read-csv',
      schemaVersion: '1.0',
      input: 'read csv and transform',
      concepts: ['read', 'transform'],
      preferredSkills: ['skill-csv-reader'],
    }
    await writeFile(join(dir, '.aios', 'intents', 'read-csv.json'), JSON.stringify(fixture))
    const t = new RecordedIntentTranslator(dir)
    const result = await t.translate({ input: 'read csv and transform' })
    expect(result.status).toBe('SUCCESS')
    expect(result.intent.concepts).toEqual(['read', 'transform'])
    await rm(dir, { recursive: true, force: true })
  })

  it('returns DECLINED for input not in fixtures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aios-planner-test-'))
    await mkdir(join(dir, '.aios', 'intents'), { recursive: true })
    const t = new RecordedIntentTranslator(dir)
    const result = await t.translate({ input: 'unknown intent' })
    expect(result.status).toBe('DECLINED')
    await rm(dir, { recursive: true, force: true })
  })
})

describe('CompositeIntentTranslator', () => {
  it('returns first SUCCESS result and stops', async () => {
    const recorded = new StaticIntentTranslator([
      { input: 'test phrase', concepts: ['test'], preferredSkills: [] },
    ])
    const fallback = new StaticIntentTranslator([
      { input: 'test phrase', concepts: ['WRONG'], preferredSkills: [] },
    ])
    const composite = new CompositeIntentTranslator([recorded, fallback])
    const result = await composite.translate({ input: 'test phrase' })
    expect(result.status).toBe('SUCCESS')
    expect(result.intent.concepts).toEqual(['test'])
  })

  it('falls through to next translator on DECLINED', async () => {
    const first = new StaticIntentTranslator([])
    const second = new StaticIntentTranslator([
      { input: 'fallback phrase', concepts: ['fallback'], preferredSkills: [] },
    ])
    const composite = new CompositeIntentTranslator([first, second])
    const result = await composite.translate({ input: 'fallback phrase' })
    expect(result.status).toBe('SUCCESS')
    expect(result.intent.concepts).toEqual(['fallback'])
  })

  it('returns DECLINED when all translators decline', async () => {
    const composite = new CompositeIntentTranslator([new StaticIntentTranslator([])])
    const result = await composite.translate({ input: 'completely unknown' })
    expect(result.status).toBe('DECLINED')
  })
})
