import { EventEmitter } from 'node:events'
import type { EventBus } from '../domain/context.js'

export class NodeEventBus implements EventBus {
  private emitter = new EventEmitter()

  emit(event: string, data?: unknown): void {
    this.emitter.emit(event, data)
  }

  on(event: string, handler: (data: unknown) => void): void {
    this.emitter.on(event, handler)
  }

  off(event: string, handler: (data: unknown) => void): void {
    this.emitter.off(event, handler)
  }
}
