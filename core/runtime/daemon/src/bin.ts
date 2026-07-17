import { DaemonHost } from './host/daemon-host.js'
import { ShutdownCoordinator } from './shutdown/shutdown-coordinator.js'
import { DEFAULT_DAEMON_POLICY } from '@rohinik-org/compiler'

const host = new DaemonHost({ policy: DEFAULT_DAEMON_POLICY })
const coordinator = new ShutdownCoordinator(host, DEFAULT_DAEMON_POLICY.gracefulShutdownTimeoutMs)
coordinator.wire()

host.start().then(({ sessionId, socketPath }) => {
  console.log(`rhkd started session=${sessionId} socket=${socketPath}`)
}).catch((err: unknown) => {
  console.error('rhkd failed to start:', err)
  process.exit(1)
})
