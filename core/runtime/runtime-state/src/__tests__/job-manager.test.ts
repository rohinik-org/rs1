import { describe, it, expect, beforeEach } from 'vitest'
import { JobManager } from '../jobs/job-manager.js'

describe('JobManager', () => {
  let mgr: JobManager

  beforeEach(() => { mgr = new JobManager() })

  it('submit() creates job in queued state', () => {
    const job = mgr.submit('s1', 'download', 'get file')
    expect(job.status).toBe('queued')
  })

  it('start() transitions to running', () => {
    const job = mgr.submit('s1', 'download', 'get file')
    expect(mgr.start(job.id).status).toBe('running')
  })

  it('pause() transitions to paused', () => {
    const job = mgr.submit('s1', 'index', 'index docs')
    mgr.start(job.id)
    expect(mgr.pause(job.id).status).toBe('paused')
  })

  it('resume() transitions paused back to running', () => {
    const job = mgr.submit('s1', 'index', 'index docs')
    mgr.start(job.id)
    mgr.pause(job.id)
    expect(mgr.resume(job.id).status).toBe('running')
  })

  it('complete() sets completedAt', () => {
    const job = mgr.submit('s1', 'download', 'get file')
    mgr.start(job.id)
    const done = mgr.complete(job.id, { bytes: 100 })
    expect(done.status).toBe('completed')
    expect(done.completedAt).toBeDefined()
    expect(done.result).toEqual({ bytes: 100 })
  })

  it('fail() transitions to failed', () => {
    const job = mgr.submit('s1', 'download', 'get file')
    mgr.start(job.id)
    expect(mgr.fail(job.id).status).toBe('failed')
  })

  it('cancel() transitions to cancelled', () => {
    const job = mgr.submit('s1', 'download', 'get file')
    expect(mgr.cancel(job.id).status).toBe('cancelled')
  })

  it('list() filters by sessionId', () => {
    mgr.submit('s1', 'download', 'a')
    mgr.submit('s2', 'download', 'b')
    expect(mgr.list('s1')).toHaveLength(1)
  })

  it('get() returns undefined for unknown job', () => {
    expect(mgr.get('nope')).toBeUndefined()
  })
})
