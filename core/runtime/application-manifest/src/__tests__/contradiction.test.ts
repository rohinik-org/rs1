import { describe, it, expect } from 'vitest'
import { detectContradictions } from '../contradiction.js'
import type { CapabilityConstraint } from '@rohinik-org/capability-contracts-ir'

function makeConstraints(overrides: Partial<CapabilityConstraint>[]): readonly CapabilityConstraint[] {
  return overrides as CapabilityConstraint[]
}

it('local-only + remote-required is contradictory', () => {
  const constraints = makeConstraints([
    { kind: 'execution-location', mode: 'local-only', hardness: 'hard' },
    { kind: 'execution-location', mode: 'remote-required', hardness: 'hard' },
  ])
  const diag = detectContradictions(constraints, 'cap[0]')
  expect(diag.some(d => d.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
})

it('two compatible execution modes are not contradictory', () => {
  const constraints = makeConstraints([
    { kind: 'execution-location', mode: 'local-preferred', hardness: 'soft' },
  ])
  const diag = detectContradictions(constraints, 'cap[0]')
  expect(diag).toHaveLength(0)
})

it('feature required and forbidden same feature is contradictory', () => {
  const constraints = makeConstraints([
    { kind: 'feature', requiredFeatures: ['vision'], forbiddenFeatures: ['vision'], hardness: 'hard' },
  ])
  const diag = detectContradictions(constraints, 'cap[0]')
  expect(diag.some(d => d.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
})

it('non-overlapping required and forbidden features is not contradictory', () => {
  const constraints = makeConstraints([
    { kind: 'feature', requiredFeatures: ['vision'], forbiddenFeatures: ['streaming'], hardness: 'hard' },
  ])
  const diag = detectContradictions(constraints, 'cap[0]')
  expect(diag).toHaveLength(0)
})

it('disjoint hard residency regions is contradictory', () => {
  const constraints = makeConstraints([
    { kind: 'data-residency', allowedRegions: ['us-east-1'] },
    { kind: 'data-residency', allowedRegions: ['eu-west-1'] },
  ])
  const diag = detectContradictions(constraints, 'cap[0]')
  expect(diag.some(d => d.code === 'CONTRADICTORY_CONSTRAINTS')).toBe(true)
})

it('overlapping residency regions is not contradictory', () => {
  const constraints = makeConstraints([
    { kind: 'data-residency', allowedRegions: ['us-east-1', 'eu-west-1'] },
    { kind: 'data-residency', allowedRegions: ['eu-west-1'] },
  ])
  const diag = detectContradictions(constraints, 'cap[0]')
  expect(diag).toHaveLength(0)
})
