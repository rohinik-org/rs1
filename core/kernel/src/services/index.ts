export { createLogger } from './logger.js'
export { InMemoryMetricsCollector } from './metrics.js'
export { InMemoryConfigService } from './config.js'
export { NullCacheService } from './cache.js'
export { NodeEventBus } from './events.js'

import type { RuntimeServices } from '../domain/context.js'
import type { SystemConfig } from '../domain/config.js'
import { createLogger } from './logger.js'
import { InMemoryMetricsCollector } from './metrics.js'
import { InMemoryConfigService } from './config.js'
import { NullCacheService } from './cache.js'
import { NodeEventBus } from './events.js'

export function createRuntimeServices(_config: SystemConfig): RuntimeServices {
  return {
    logger: createLogger({ level: 'info' }),
    metrics: new InMemoryMetricsCollector(),
    config: new InMemoryConfigService({}),
    cache: new NullCacheService(),
    events: new NodeEventBus(),
  }
}
