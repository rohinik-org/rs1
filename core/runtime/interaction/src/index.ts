export type {
  TransportType,
  InteractionType,
  InteractionContext,
  RuntimeInteractionRequest,
  RuntimeInteractionResponse,
  RuntimeEvent,
  IpcEnvelope,
  InteractionAdapter,
  Transport,
} from './types.js'
export { NullAdapter, makeNullRequest } from './adapter.js'
export { IpcTransport } from './transport/ipc-transport.js'
export { HttpTransport } from './transport/http-transport.js'
export type { HttpTransportClient } from './transport/http-transport.js'
export { selectTransport } from './transport/transport-selector.js'
export type { TransportSelectorOptions } from './transport/transport-selector.js'
export { InteractionContextFactory } from './context-factory.js'
export type { ContextFactoryOptions } from './context-factory.js'
export { InteractionLayer } from './interaction-layer.js'
export type { InteractionLayerOptions } from './interaction-layer.js'
export { RuntimeInteractionBus } from './bus.js'
