import { randomUUID } from 'node:crypto'
import type { BackgroundJob, JobStatus } from '../types.js'

export class JobManager {
  private readonly jobs = new Map<string, BackgroundJob>()

  submit(sessionId: string, type: string, description: string): BackgroundJob {
    const job: BackgroundJob = {
      id: randomUUID(), sessionId, type, description,
      status: 'queued', createdAt: new Date(),
    }
    this.jobs.set(job.id, job)
    return job
  }

  get(id: string): BackgroundJob | undefined {
    return this.jobs.get(id)
  }

  list(sessionId?: string): ReadonlyArray<BackgroundJob> {
    const all = Array.from(this.jobs.values())
    return sessionId ? all.filter(j => j.sessionId === sessionId) : all
  }

  transition(id: string, status: JobStatus, extras: Partial<Pick<BackgroundJob, 'progress' | 'result' | 'completedAt'>> = {}): BackgroundJob {
    const job = this.jobs.get(id)
    if (!job) throw new Error(`Job not found: ${id}`)
    const updated: BackgroundJob = {
      ...job, status, ...extras,
      completedAt: (status === 'completed' || status === 'failed' || status === 'cancelled')
        ? (extras.completedAt ?? new Date())
        : job.completedAt,
    }
    this.jobs.set(id, updated)
    return updated
  }

  start(id: string): BackgroundJob { return this.transition(id, 'running') }
  pause(id: string): BackgroundJob { return this.transition(id, 'paused') }
  resume(id: string): BackgroundJob { return this.transition(id, 'running') }
  complete(id: string, result?: unknown): BackgroundJob { return this.transition(id, 'completed', { result }) }
  fail(id: string): BackgroundJob { return this.transition(id, 'failed') }
  cancel(id: string): BackgroundJob { return this.transition(id, 'cancelled') }
}
