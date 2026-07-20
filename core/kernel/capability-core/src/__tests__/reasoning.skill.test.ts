import { describe, it, expect, vi } from 'vitest'
import { ReasoningSkill, buildIdentitySystemPrompt } from '../reasoning/reasoning.skill.js'
import type { RuntimeIdentityContext } from '@rohinik-org/compiler'

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

const makeIdentityCtx = (overrides?: Partial<RuntimeIdentityContext>): RuntimeIdentityContext => ({
  constitutional: { brand: 'Rohinik', role: 'Intelligent Computing Platform', version: '0.1.0' },
  installedCapabilities: ['builtin:reasoning', 'builtin:memory'],
  availableProviders: ['anthropic'],
  runtimeVersion: '0.1.0',
  ...overrides,
})

describe('buildIdentitySystemPrompt', () => {
  it('contains brand Rohinik not Claude in identity line', () => {
    const prompt = buildIdentitySystemPrompt(makeIdentityCtx())
    expect(prompt).toContain('Rohinik')
    expect(prompt.startsWith('You are Rohinik')).toBe(true)
  })

  it('uses assistantName from persona when set', () => {
    const prompt = buildIdentitySystemPrompt(makeIdentityCtx({ persona: { assistantName: 'NYRA' } }))
    expect(prompt).toContain('NYRA')
  })

  it('lists installed capabilities', () => {
    const prompt = buildIdentitySystemPrompt(makeIdentityCtx())
    expect(prompt).toContain('builtin:reasoning')
  })
})
