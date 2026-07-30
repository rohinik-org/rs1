import { it, expect } from 'vitest'
import { validateSemantics } from '../semantic-validator.js'
import type { StructuredDoc } from '../structural-validator.js'

function makeDoc(overrides: Partial<StructuredDoc> = {}): StructuredDoc {
  return {
    schemaVersion: 'rohinik.package/v1',
    package: { id: 'com.example.my-package', name: 'My Package', version: '1.0.0', type: 'capability-provider' },
    ...overrides,
  }
}

it('valid doc produces no issues', () => {
  expect(validateSemantics(makeDoc()).length).toBe(0)
})

it('invalid package.id (no dots) → validation-failed', () => {
  const issues = validateSemantics(makeDoc({ package: { ...makeDoc().package, id: 'nodots' } }))
  expect(issues.some(i => i.path === 'package.id')).toBe(true)
})

it('invalid package.id (trailing hyphen) → validation-failed', () => {
  const issues = validateSemantics(makeDoc({ package: { ...makeDoc().package, id: 'com.example-' } }))
  expect(issues.some(i => i.path === 'package.id')).toBe(true)
})

it('valid package.id passes', () => {
  const issues = validateSemantics(makeDoc({ package: { ...makeDoc().package, id: 'org.example.foo-bar' } }))
  expect(issues.filter(i => i.path === 'package.id').length).toBe(0)
})

it('invalid capability ID → validation-failed', () => {
  const issues = validateSemantics(makeDoc({
    provides: [{ capability: 'INVALID', version: '1.0.0' }],
  }))
  expect(issues.some(i => i.path === 'provides[0].capability')).toBe(true)
})

it('duplicate capability IDs → validation-failed', () => {
  const issues = validateSemantics(makeDoc({
    provides: [
      { capability: 'ai:generate:text', version: '1.0.0' },
      { capability: 'ai:generate:text', version: '2.0.0' },
    ],
  }))
  expect(issues.some(i => i.message.includes('Duplicate') && i.message.includes('ai:generate:text'))).toBe(true)
})

it('duplicate npm deps → validation-failed', () => {
  const issues = validateSemantics(makeDoc({
    dependencies: {
      npm: [
        { name: 'lodash', version: '^4' },
        { name: 'lodash', version: '^4' },
      ],
    },
  }))
  expect(issues.some(i => i.message.includes('lodash'))).toBe(true)
})

it('path traversal in entrypoint → validation-failed', () => {
  const issues = validateSemantics(makeDoc({
    runtime: { language: 'nodejs', entrypoint: '../dist/index.js' },
  }))
  expect(issues.some(i => i.path === 'runtime.entrypoint')).toBe(true)
})

it('absolute entrypoint → validation-failed', () => {
  const issues = validateSemantics(makeDoc({
    runtime: { language: 'nodejs', entrypoint: '/dist/index.js' },
  }))
  expect(issues.some(i => i.path === 'runtime.entrypoint')).toBe(true)
})

it('relative entrypoint without traversal passes', () => {
  const issues = validateSemantics(makeDoc({
    runtime: { language: 'nodejs', entrypoint: 'dist/index.js' },
  }))
  expect(issues.filter(i => i.path === 'runtime.entrypoint').length).toBe(0)
})

it('invalid package type → validation-failed', () => {
  const issues = validateSemantics(makeDoc({ package: { ...makeDoc().package, type: 'not-a-type' } }))
  expect(issues.some(i => i.path === 'package.type')).toBe(true)
})

it('invalid publisher certification → validation-failed', () => {
  const issues = validateSemantics(makeDoc({
    publisher: { id: 'com.example', certification: 'unknown-cert' },
  }))
  expect(issues.some(i => i.path === 'publisher.certification')).toBe(true)
})
