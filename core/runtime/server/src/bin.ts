import { loadConfig, createProductionHost } from '@rohinik-org/runtime'
import { AiosServer } from './server.js'

const configPath = process.env['ROHINIK_CONFIG'] ?? './rohinik.yaml'

loadConfig(configPath)
  .then(async (config) => {
    const host = createProductionHost(config)
    await host.start()

    const server = new AiosServer(host, config.server)
    await server.listen()

    const addr = `http://${config.server.host}:${config.server.port}`
    console.log(`rhks started  config=${configPath}  addr=${addr}`)

    for (const sig of ['SIGINT', 'SIGTERM'] as const) {
      process.on(sig, () => {
        console.log(`rhks stopping (${sig})`)
        server.close().then(() => host.stop()).then(() => process.exit(0)).catch(() => process.exit(1))
      })
    }
  })
  .catch((err: unknown) => {
    console.error('rhks failed to start:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
