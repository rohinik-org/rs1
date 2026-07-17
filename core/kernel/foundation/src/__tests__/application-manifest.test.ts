import { describe, it, expect } from 'vitest'
import { buildManifest } from '../manifest/application-manifest.js'
import type { ApplicationContext } from '@rohinik-org/compiler'

const ctx: ApplicationContext = {
  applicationId: 'app-1', name: 'myapp', version: '1.0.0',
  startedAt: new Date().toISOString(), status: 'READY',
}

describe('buildManifest', () => {
  it('returns manifest with application fields', () => {
    const m = buildManifest(ctx, {})
    expect(m.applicationId).toBe('app-1')
    expect(m.name).toBe('myapp')
    expect(m.version).toBe('1.0.0')
  })

  it('lists no capabilities when nothing enabled', () => {
    const m = buildManifest(ctx, {})
    expect(m.enabledCapabilities).toHaveLength(0)
  })

  it('lists enabled capabilities', () => {
    const m = buildManifest(ctx, { enableMemory: true, enableReasoning: true })
    expect(m.enabledCapabilities).toContain('memory')
    expect(m.enabledCapabilities).toContain('reasoning')
  })

  it('sets createdAt from context startedAt', () => {
    const m = buildManifest(ctx, {})
    expect(m.createdAt).toBe(ctx.startedAt)
  })

  it('lists all 6 capabilities when all enabled', () => {
    const m = buildManifest(ctx, {
      enableMemory: true, enableReasoning: true, enableReflection: true,
      enableObservation: true, enableCertification: true, enableCluster: true,
    })
    expect(m.enabledCapabilities).toHaveLength(6)
  })
})
