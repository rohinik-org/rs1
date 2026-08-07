/**
 * Streaming execution runner.
 *
 * Drives an ExecutionHandle through its lifecycle using events() with
 * streamMode:'auto'. Renders events via caller-supplied callbacks.
 * No app-level retry or reconnect — that lives in the SDK.
 *
 * Cancellation: caller signals via AbortSignal; the runner calls
 * execution.cancel() once then lets the event stream reach terminal.
 */

import type { ExecutionHandle, PublicExecutionEvent } from '@rohinik-org/client'
import { RohinikClientError, ExecutionCancelledError, ExecutionFailedError } from '@rohinik-org/client'

export interface StreamCallbacks {
  /** Called for every raw event delivered by the SDK. */
  onEvent?: (event: PublicExecutionEvent) => void
  /**
   * Called when the SDK switches from SSE to polling.
   * Use for UX: "Switched to polling mode".
   */
  onStreamModeChange?: (mode: 'sse' | 'poll') => void
  /** Called when CANCELLATION_REQUESTED event arrives. */
  onCancellationRequested?: () => void
}

export type StreamOutcome =
  | { status: 'completed'; executionId: string }
  | { status: 'cancelled'; executionId: string }
  | { status: 'failed';    executionId: string; error: Error }

/**
 * Stream all events for an execution to terminal, then return outcome.
 *
 * @param execution  SDK ExecutionHandle (already started)
 * @param callbacks  rendering/observability hooks
 * @param signal     AbortSignal — triggers execution.cancel() once, then
 *                   waits for terminal; does NOT close the event stream early
 * @param timeoutMs  passed to events(); defaults to 30 000
 */
export async function streamExecution(
  execution: ExecutionHandle,
  callbacks?: StreamCallbacks,
  signal?: AbortSignal,
  timeoutMs = 30_000,
): Promise<StreamOutcome> {
  let cancelFired = false

  // Wire up cancel-on-abort: call execution.cancel() once, then let the
  // stream continue until EXECUTION_CANCELLED terminal event.
  if (signal) {
    const fireCancel = () => {
      if (!cancelFired) {
        cancelFired = true
        execution.cancel().catch(() => { /* already terminal */ })
      }
    }
    if (signal.aborted) {
      fireCancel()
    } else {
      signal.addEventListener('abort', fireCancel, { once: true })
    }
  }

  try {
    for await (const event of execution.events({
      streamMode: 'auto',
      timeoutMs,
      ...(callbacks?.onStreamModeChange ? { onStreamModeChange: callbacks.onStreamModeChange } : {}),
    })) {
      callbacks?.onEvent?.(event)

      const kind = (event as unknown as { kind: string }).kind
      if (kind === 'CANCELLATION_REQUESTED') {
        callbacks?.onCancellationRequested?.()
      }
    }
  } catch (err) {
    return {
      status: 'failed',
      executionId: execution.executionId,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }

  // Determine outcome from final status
  try {
    const status = await execution.status()
    if (status.state === 'CANCELLED') return { status: 'cancelled', executionId: execution.executionId }
    if (status.state === 'FAILED')    return { status: 'failed', executionId: execution.executionId, error: new ExecutionFailedError(execution.executionId, 'FAILED') }
    return { status: 'completed', executionId: execution.executionId }
  } catch (err) {
    return {
      status: 'failed',
      executionId: execution.executionId,
      error: err instanceof Error ? err : new Error(String(err)),
    }
  }
}
