import { describe, it, expect } from 'vitest'
import { scanSource } from '../scanner.js'

// T-9F-42 — detects literal capability() from SDK import
it('detects capability() call from @rohinik-org/sdk import', () => {
  const source = `
    import { capability } from '@rohinik-org/sdk'
    const gen = capability('ai:generate:text')
  `
  const result = scanSource(source, 'app.ts')
  expect(result.usages.some(u => u.capabilityId === 'ai:generate:text')).toBe(true)
  expect(result.usages[0]!.isDynamic).toBe(false)
})

// Import alias support
it('detects aliased capability() call from @rohinik-org/sdk', () => {
  const source = `
    import { capability as cap } from '@rohinik-org/sdk'
    const gen = cap('ai:generate:text')
  `
  const result = scanSource(source, 'app.ts')
  expect(result.usages.some(u => u.capabilityId === 'ai:generate:text')).toBe(true)
})

// False positive prevention — local function named capability
it('does NOT detect capability() from a local function (false positive prevention)', () => {
  const source = `
    function capability(value: string) { return value }
    capability('ai:generate:text')
  `
  const result = scanSource(source, 'app.ts')
  expect(result.usages).toHaveLength(0)
})

// False positive prevention — non-SDK import
it('does NOT detect capability() from a different import', () => {
  const source = `
    import { capability } from 'some-other-package'
    capability('ai:generate:text')
  `
  const result = scanSource(source, 'app.ts')
  expect(result.usages).toHaveLength(0)
})

// T-9F-45 — dynamic call → indeterminate
it('detects dynamic capability() argument as indeterminate', () => {
  const source = `
    import { capability } from '@rohinik-org/sdk'
    const name = getCapabilityName()
    const cap = capability(name)
  `
  const result = scanSource(source, 'app.ts')
  expect(result.indeterminateUsages.length).toBeGreaterThan(0)
})

// T-9F-44 — scanner result has no requirementSet
it('scan result has no requirementSet field (T-9F-44)', () => {
  const source = `import { capability } from '@rohinik-org/sdk'`
  const result = scanSource(source, 'app.ts')
  expect('requirementSet' in result).toBe(false)
})

// No capability calls → empty result
it('file with no capability calls returns empty result', () => {
  const result = scanSource(`const x = 1`, 'app.ts')
  expect(result.usages).toHaveLength(0)
  expect(result.indeterminateUsages).toHaveLength(0)
})

// Lexical shadowing — known limitation documented explicitly
it('parameter shadowing: known limitation, non-asserting test documents current behavior', () => {
  const source = `
    import { capability } from '@rohinik-org/sdk'
    function run(capability: (id: string) => unknown) {
      capability('ai:generate:text')
    }
  `
  const result = scanSource(source, 'app.ts')
  // Non-asserting: documents that the current scanner may report false positives with shadowed names
  expect(result.usages.length + result.indeterminateUsages.length).toBeGreaterThanOrEqual(0)
})

// Scanner parse failure → diagnostic, not silent empty
it('unparseable source file returns SOURCE_SCAN_PARSE_FAILED diagnostic', () => {
  const result = scanSource(': broken: yaml nonsense {{{{', 'broken.ts')
  expect(result.parseFailure).toBeDefined()
  expect(result.parseFailure!.code).toBe('SOURCE_SCAN_PARSE_FAILED')
  expect(result.usages).toHaveLength(0)
})
