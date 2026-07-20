import type {
  RawStartedPayload,
  RawProgressPayload,
  RawOutputPayload,
  RawWarningPayload,
  RawCompletePayload,
} from './driver-raw-event.js'
import type { DriverError } from './driver-error.js'

export interface BaseEvent {
  readonly requestId: string
  readonly executionId: string
  readonly driverId: string
  readonly sequence: number
  readonly timestamp: Date
}

export type DriverEvent<T = unknown> =
  | (BaseEvent & { readonly type: 'STARTED'; readonly payload: RawStartedPayload })
  | (BaseEvent & { readonly type: 'PROGRESS'; readonly payload: RawProgressPayload })
  | (BaseEvent & { readonly type: 'OUTPUT'; readonly payload: RawOutputPayload })
  | (BaseEvent & { readonly type: 'WARNING'; readonly payload: RawWarningPayload })
  | (BaseEvent & { readonly type: 'RESULT'; readonly payload: T })
  | (BaseEvent & { readonly type: 'COMPLETE'; readonly payload: RawCompletePayload })
  | (BaseEvent & { readonly type: 'ERROR'; readonly payload: DriverError })
