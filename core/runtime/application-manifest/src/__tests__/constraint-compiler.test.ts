import { describe, it, expect } from 'vitest'
import { compileConstraints } from '../constraint-compiler.js'

// T-9F-20 — execution shorthand
it('execution: local-preferred compiles to ExecutionLocationConstraint soft', () => {
  const { constraints, diagnostics } = compileConstraints({ execution: 'local-preferred' }, 'cap[0]')
  expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  expect(constraints[0]).toMatchObject({ kind: 'execution-location', mode: 'local-preferred', hardness: 'soft' })
})

it('execution: local-only compiles to ExecutionLocationConstraint hard', () => {
  const { constraints } = compileConstraints({ execution: 'local-only' }, 'cap[0]')
  expect(constraints[0]).toMatchObject({ kind: 'execution-location', mode: 'local-only', hardness: 'hard' })
})

it('execution: remote-required compiles to ExecutionLocationConstraint hard', () => {
  const { constraints } = compileConstraints({ execution: 'remote-required' }, 'cap[0]')
  expect(constraints[0]).toMatchObject({ kind: 'execution-location', mode: 'remote-required', hardness: 'hard' })
})

it('invalid execution value is rejected', () => {
  const { diagnostics } = compileConstraints({ execution: 'warp-speed' }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

it('minimumContextTokens compiles to ContextCapacityConstraint soft', () => {
  const { constraints, diagnostics } = compileConstraints({ minimumContextTokens: 32768 }, 'cap[0]')
  expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  expect(constraints[0]).toMatchObject({ kind: 'context-capacity', minimumContextTokens: 32768, hardness: 'soft' })
})

it('minimumContextTokens! compiles to ContextCapacityConstraint hard', () => {
  const { constraints } = compileConstraints({ 'minimumContextTokens!': 32768 }, 'cap[0]')
  expect(constraints[0]).toMatchObject({ kind: 'context-capacity', minimumContextTokens: 32768, hardness: 'hard' })
})

it('minimumContextTokens non-integer is rejected', () => {
  const { diagnostics } = compileConstraints({ minimumContextTokens: 1.5 }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

it('minimumContextTokens negative is rejected', () => {
  const { diagnostics } = compileConstraints({ minimumContextTokens: -1 }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

it('minimumContextTokens string is rejected', () => {
  const { diagnostics } = compileConstraints({ minimumContextTokens: 'nonsense' }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

// T-9F-24 — mediaTypes → FeatureConstraint
it('mediaTypes compiles to FeatureConstraint hard', () => {
  const { constraints, diagnostics } = compileConstraints({ mediaTypes: ['application/pdf', 'text/plain'] }, 'cap[0]')
  expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  expect(constraints[0]).toMatchObject({
    kind: 'feature',
    requiredFeatures: ['application/pdf', 'text/plain'],
    hardness: 'hard',
  })
})

it('mediaTypes non-array is rejected', () => {
  const { diagnostics } = compileConstraints({ mediaTypes: 'application/pdf' }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

it('mediaTypes empty array is rejected', () => {
  const { diagnostics } = compileConstraints({ mediaTypes: [] }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

it('residency empty array is rejected', () => {
  const { diagnostics } = compileConstraints({ residency: [] }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

it('residency compiles to DataResidencyConstraint', () => {
  const { constraints, diagnostics } = compileConstraints({ residency: ['eu-west-1'] }, 'cap[0]')
  expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  expect(constraints[0]).toMatchObject({ kind: 'data-residency', allowedRegions: ['eu-west-1'] })
})

it('maximumLatencyMs compiles to LatencyConstraint soft', () => {
  const { constraints, diagnostics } = compileConstraints({ maximumLatencyMs: 500 }, 'cap[0]')
  expect(diagnostics.filter(d => d.severity === 'error')).toHaveLength(0)
  expect(constraints[0]).toMatchObject({ kind: 'latency', maximumMs: 500, hardness: 'soft' })
})

it('maximumLatencyMs! compiles to LatencyConstraint hard', () => {
  const { constraints } = compileConstraints({ 'maximumLatencyMs!': 200 }, 'cap[0]')
  expect(constraints[0]).toMatchObject({ kind: 'latency', maximumMs: 200, hardness: 'hard' })
})

it('maximumLatencyMs negative is rejected', () => {
  const { diagnostics } = compileConstraints({ maximumLatencyMs: -1 }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'INVALID_CONSTRAINT_VALUE')).toBe(true)
})

// T-9F-21 — unknown constraint key
it('unknown constraint key is rejected', () => {
  const { diagnostics } = compileConstraints({ magicBoost: true }, 'cap[0]')
  expect(diagnostics.some(d => d.code === 'UNKNOWN_CONSTRAINT_KEY')).toBe(true)
})

it('undefined constraints returns empty result', () => {
  const { constraints, diagnostics } = compileConstraints(undefined, 'cap[0]')
  expect(constraints).toHaveLength(0)
  expect(diagnostics).toHaveLength(0)
})
