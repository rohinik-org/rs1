import { describe, it, expect } from 'vitest'
import { IdentityService } from '../identity/identity-service.js'

const caps = () => ['reasoning', 'command-execution'] as const
const providers = () => ['anthropic'] as const

describe('IdentityService', () => {
  it('buildSystemPrompt contains Rohinik, not Claude', () => {
    const svc = new IdentityService(undefined, caps, providers)
    const prompt = svc.buildSystemPrompt()
    expect(prompt).toContain('Rohinik')
    expect(prompt).not.toContain('Claude')
  })

  it('uses assistantName from persona when set', () => {
    const svc = new IdentityService({ assistantName: 'NYRA' }, caps, providers)
    const prompt = svc.buildSystemPrompt()
    expect(prompt).toContain('NYRA')
  })

  it('lists installed capabilities in prompt', () => {
    const svc = new IdentityService(undefined, caps, providers)
    const prompt = svc.buildSystemPrompt()
    expect(prompt).toContain('reasoning')
    expect(prompt).toContain('command-execution')
  })

  it('includes deployment instructions when persona has them', () => {
    const svc = new IdentityService(
      { instructions: 'Always respond concisely.' },
      caps,
      providers,
    )
    const prompt = svc.buildSystemPrompt()
    expect(prompt).toContain('Always respond concisely.')
  })
})
