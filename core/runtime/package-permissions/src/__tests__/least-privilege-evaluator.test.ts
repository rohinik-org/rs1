import { describe, it, expect } from 'vitest'
import { evaluateLeastPrivilege } from '../least-privilege-evaluator.js'

describe('least-privilege-evaluator', () => {
  it('returns no findings for a well-scoped permission', () => {
    const perms = [{ domain: 'filesystem', value: '/app/data', resourceConstraint: 'read' }]
    expect(evaluateLeastPrivilege(perms)).toHaveLength(0)
  })

  it('flags global-scope for value *', () => {
    const perms = [{ domain: 'filesystem', value: '*' }]
    const findings = evaluateLeastPrivilege(perms)
    expect(findings.some(f => f.kind === 'global-scope')).toBe(true)
  })

  it('flags redundant-administrative for administrative domain', () => {
    const perms = [{ domain: 'administrative', value: 'super-access' }]
    const findings = evaluateLeastPrivilege(perms)
    expect(findings.some(f => f.kind === 'redundant-administrative')).toBe(true)
  })

  it('flags unexplained-broad-permission for filesystem without resourceConstraint', () => {
    const perms = [{ domain: 'filesystem', value: '/tmp' }]
    const findings = evaluateLeastPrivilege(perms)
    expect(findings.some(f => f.kind === 'unexplained-broad-permission')).toBe(true)
  })

  it('flags unexplained-broad-permission for network without resourceConstraint', () => {
    const perms = [{ domain: 'network', value: 'api.example.com' }]
    const findings = evaluateLeastPrivilege(perms)
    expect(findings.some(f => f.kind === 'unexplained-broad-permission')).toBe(true)
  })

  it('no unexplained-broad-permission when resourceConstraint provided', () => {
    const perms = [{ domain: 'network', value: 'api.example.com', resourceConstraint: ':443' }]
    const findings = evaluateLeastPrivilege(perms)
    expect(findings.filter(f => f.kind === 'unexplained-broad-permission')).toHaveLength(0)
  })
})
