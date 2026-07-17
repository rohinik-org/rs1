import { describe, it, expect } from 'vitest'
import { DefaultWorkflowConfidenceStrategy } from '../scoring/default-confidence-strategy.js'

describe('DefaultWorkflowConfidenceStrategy', () => {
  const strategy = new DefaultWorkflowConfidenceStrategy()

  it('has strategyId', () => {
    expect(strategy.strategyId).toBe('DefaultWorkflowConfidenceStrategy')
  })

  it('returns 0 for zero executions', () => {
    expect(strategy.score({ executionCount: 0, successfulExecutions: 0, failedExecutions: 0, uniqueSessions: 0 })).toBe(0)
  })

  it('caps at 0.95', () => {
    const score = strategy.score({ executionCount: 1000, successfulExecutions: 1000, failedExecutions: 0, uniqueSessions: 50 })
    expect(score).toBe(0.95)
  })

  it('shrinks toward 0 for small samples — 1 success = well below 0.5', () => {
    const score = strategy.score({ executionCount: 1, successfulExecutions: 1, failedExecutions: 0, uniqueSessions: 1 })
    // 1 / (1 + 5) = 0.1667
    expect(score).toBeCloseTo(1 / 6, 3)
  })

  it('gives higher score with more successes', () => {
    const low = strategy.score({ executionCount: 3, successfulExecutions: 3, failedExecutions: 0, uniqueSessions: 1 })
    const high = strategy.score({ executionCount: 50, successfulExecutions: 50, failedExecutions: 0, uniqueSessions: 5 })
    expect(high).toBeGreaterThan(low)
  })

  it('penalises failures', () => {
    const clean = strategy.score({ executionCount: 20, successfulExecutions: 20, failedExecutions: 0, uniqueSessions: 5 })
    const noisy = strategy.score({ executionCount: 20, successfulExecutions: 10, failedExecutions: 10, uniqueSessions: 5 })
    expect(clean).toBeGreaterThan(noisy)
  })
})
