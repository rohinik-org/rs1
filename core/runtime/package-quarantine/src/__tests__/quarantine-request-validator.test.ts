import { describe, it, expect } from 'vitest'
import { validateQuarantineRequest } from '../quarantine-request-validator.js'
import { makeRequest, makePolicy, makeSubject, makeArtifactRef } from './fixtures.js'

describe('QuarantineRequestValidator', () => {
  it('accepts a valid request', () => {
    expect(validateQuarantineRequest(makeRequest('denied'))).toEqual({ valid: true })
  })

  it('rejects missing subject', () => {
    const r = makeRequest('denied', { subject: undefined as never })
    expect(validateQuarantineRequest(r)).toMatchObject({ valid: false })
  })

  it('rejects empty operationId', () => {
    const r = makeRequest('denied', { operationId: '' })
    expect(validateQuarantineRequest(r)).toMatchObject({ valid: false, reason: expect.stringContaining('operationId') })
  })

  it('rejects invalid requestedAt', () => {
    const r = makeRequest('denied', { requestedAt: 'not-a-date' })
    expect(validateQuarantineRequest(r)).toMatchObject({ valid: false, reason: expect.stringContaining('requestedAt') })
  })

  it('rejects sourceLocation with ..', () => {
    const artifact = makeArtifactRef()
    const r = makeRequest('denied', { artifact: { ...artifact, sourceLocation: '../etc/passwd' } })
    expect(validateQuarantineRequest(r)).toMatchObject({ valid: false, reason: expect.stringContaining('..') })
  })

  it('rejects defaultMode not in allowedModes', () => {
    const policy = makePolicy({ allowedModes: ['seal'], defaultMode: 'isolate' })
    const r = makeRequest('denied', { policy })
    expect(validateQuarantineRequest(r)).toMatchObject({ valid: false, reason: expect.stringContaining('defaultMode') })
  })

  it('rejects empty allowedModes', () => {
    const policy = makePolicy({ allowedModes: [] })
    const r = makeRequest('denied', { policy })
    expect(validateQuarantineRequest(r)).toMatchObject({ valid: false })
  })

  it('rejects invalid trustDecision', () => {
    const r = makeRequest('trusted' as never, { trustDecision: 'bogus' as never })
    expect(validateQuarantineRequest(r)).toMatchObject({ valid: false })
  })
})
