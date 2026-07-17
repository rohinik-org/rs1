import { describe, it, expect } from 'vitest'
import { ResponseValidator } from '../validation/response-validator.js'

describe('ResponseValidator', () => {
  const v = new ResponseValidator()

  it('fails on null output', () => {
    const r = v.validate(null)
    expect(r.valid).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('fails on undefined output', () => {
    expect(v.validate(undefined).valid).toBe(false)
  })

  it('passes for string output', () => {
    expect(v.validate('some text').valid).toBe(true)
  })

  it('passes for object output', () => {
    expect(v.validate({ result: 42 }).valid).toBe(true)
  })
})
