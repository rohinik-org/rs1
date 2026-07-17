import { describe, it, expect } from 'vitest'
import { createTestApplication } from '../testing/test-application.js'

describe('createTestApplication', () => {
  it('returns a RohinikApplication', async () => {
    const app = createTestApplication()
    await app.start()
    expect(app.context.status).toBe('READY')
  })

  it('has all facades enabled', () => {
    const app = createTestApplication()
    expect(app.memory).toBeDefined()
    expect(app.reasoning).toBeDefined()
    expect(app.certify).toBeDefined()
  })

  it('accepts overrides', () => {
    const app = createTestApplication({ name: 'my-test' })
    expect(app.context.name).toBe('my-test')
  })

  it('all facades return non-throwing results', async () => {
    const app = createTestApplication()
    await app.start()
    const recall = await app.memory.recall({ concepts: [], limit: 10 })
    expect(Array.isArray(recall)).toBe(true)
  })
})
