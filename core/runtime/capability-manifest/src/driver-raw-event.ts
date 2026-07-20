import type { DriverError } from './driver-error.js'

export interface RawStartedPayload {}
export interface RawProgressPayload {
  readonly percent: number
  readonly message?: string
}
export interface RawOutputPayload {
  readonly text: string
  readonly stream: 'stdout' | 'stderr'
}
export interface RawWarningPayload {
  readonly message: string
  readonly code?: string
}
export interface RawCompletePayload {}

export type DriverRawEvent<T = unknown> =
  | { readonly type: 'STARTED'; readonly payload: RawStartedPayload }
  | { readonly type: 'PROGRESS'; readonly payload: RawProgressPayload }
  | { readonly type: 'OUTPUT'; readonly payload: RawOutputPayload }
  | { readonly type: 'WARNING'; readonly payload: RawWarningPayload }
  | { readonly type: 'RESULT'; readonly payload: T }
  | { readonly type: 'COMPLETE'; readonly payload: RawCompletePayload }
  | { readonly type: 'ERROR'; readonly payload: DriverError }
