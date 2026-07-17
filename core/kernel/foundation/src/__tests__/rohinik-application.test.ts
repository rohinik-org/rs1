import { describe, it, expect } from 'vitest'
import { RohinikApplication, ApplicationBuilder } from '../application/rohinik-application.js'

describe('RohinikApplication', () => {
  it('creates with default options', () => {
    const app = RohinikApplication.create()
    expect(app.context.name).toBe('rohinik-app')
    expect(app.context.status).toBe('INITIALIZING')
  })

  it('start() transitions status to READY', async () => {
    const app = RohinikApplication.create()
    await app.start()
    expect(app.context.status).toBe('READY')
  })

  it('stop() transitions status to STOPPED', async () => {
    const app = RohinikApplication.create()
    await app.start()
    await app.stop()
    expect(app.context.status).toBe('STOPPED')
  })

  it('exposes 8 facade properties', () => {
    const app = RohinikApplication.create()
    expect(app.planning).toBeDefined()
    expect(app.execution).toBeDefined()
    expect(app.memory).toBeDefined()
    expect(app.reasoning).toBeDefined()
    expect(app.reflection).toBeDefined()
    expect(app.observation).toBeDefined()
    expect(app.cluster).toBeDefined()
    expect(app.certify).toBeDefined()
  })

  it('events bus fires application.started on start()', async () => {
    const app = RohinikApplication.create()
    const types: string[] = []
    app.events.on('application.started', (e) => { types.push(e.type) })
    await app.start()
    expect(types).toContain('application.started')
  })

  it('manifest() returns ApplicationManifest', async () => {
    const app = RohinikApplication.create({ name: 'test', enableMemory: true })
    await app.start()
    const m = app.manifest()
    expect(m.name).toBe('test')
    expect(m.enabledCapabilities).toContain('memory')
  })

  it('diagnostics() includes enabled facades', async () => {
    const app = RohinikApplication.create({ enableMemory: true })
    await app.start()
    const d = app.diagnostics()
    expect(d.enabledFacades).toContain('memory')
    expect(d.enabledFacades).toContain('planning')
  })

  it('builder() creates application with chained options', async () => {
    const app = new ApplicationBuilder()
      .withMemory()
      .withReasoning()
      .build()
    await app.start()
    expect(app.context.status).toBe('READY')
    expect(app.manifest().enabledCapabilities).toContain('memory')
    expect(app.manifest().enabledCapabilities).toContain('reasoning')
  })
})
