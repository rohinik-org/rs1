import { describe, it, expect, vi } from 'vitest'
import { ReasoningSkill } from '../reasoning/reasoning.skill.js'

const makeCtx = (content: string) => ({
  request: { content },
  executionId: 'test-exec-001',
})

const makeProviders = (hasProvider: boolean) => ({
  reasoningEngine: hasProvider
    ? {
        provider: {
          reason: vi.fn().mockResolvedValue({
            status: 'SUCCESS',
            result: { content: 'response' },
            skillId: 'builtin:reasoning',
            stepId: 'step-0',
            diagnostics: [],
            metrics: { durationMs: 100, resourceCost: { estimated: { cpuMs: 100 } }, cacheHit: false },
            cacheable: false,
            retryable: false,
          }),
        },
      }
    : undefined,
})

describe('ReasoningSkill', () => {
  it('metadata has skillId builtin:reasoning', () => {
    const skill = new ReasoningSkill()
    expect(skill.metadata.skillId).toBe('builtin:reasoning')
    expect(skill.metadata.tierId).toBe('REASONING')
  })

  it('evaluate returns matched with score', () => {
    const skill = new ReasoningSkill()
    // ponytail: cast to any — evaluate uses simplified ctx in tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = skill.evaluate!({} as any)
    expect(result.matched).toBe(true)
    if (result.matched) {
      expect(result.score.finalScore).toBeGreaterThan(0)
    }
  })

  it('execute succeeds when reasoningEngine provider present', async () => {
    const skill = new ReasoningSkill()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await skill.execute(makeCtx('hello') as any, makeProviders(true) as any)
    expect(result.status).toBe('SUCCESS')
  })

  it('execute returns FAILURE when no provider', async () => {
    const skill = new ReasoningSkill()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await skill.execute(makeCtx('hello') as any, makeProviders(false) as any)
    expect(result.status).toBe('FAILURE')
    expect(result.diagnostics[0]?.code).toBe('NO_PROVIDER')
  })
})
