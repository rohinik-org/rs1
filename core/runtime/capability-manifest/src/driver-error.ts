export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | JsonSerializable[]
  | { [k: string]: JsonSerializable }

export const DriverErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  ACCESS_DENIED: 'ACCESS_DENIED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  TIMEOUT: 'TIMEOUT',
  CAPABILITY_NOT_FOUND: 'CAPABILITY_NOT_FOUND',
  DRIVER_NOT_FOUND: 'DRIVER_NOT_FOUND',
  CANCELLED: 'CANCELLED',
  PROTOCOL_VIOLATION: 'PROTOCOL_VIOLATION',
} as const

export type DriverErrorCode = (typeof DriverErrorCode)[keyof typeof DriverErrorCode]

export interface DriverError {
  readonly code: DriverErrorCode
  readonly message: string
  readonly retryable: boolean
  readonly details?: Record<string, JsonSerializable>
  readonly cause?: unknown
}

export function makeDriverError(
  code: DriverErrorCode,
  message: string,
  options?: { retryable?: boolean; details?: Record<string, JsonSerializable>; cause?: unknown }
): DriverError {
  return {
    code,
    message,
    retryable: options?.retryable ?? false,
    details: options?.details,
    cause: options?.cause,
  }
}
