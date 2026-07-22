import type { ExperienceRecord } from '@rohinik-org/experience-ir'

export interface RepositoryCommit {
  readonly experienceId: string
  readonly storedAt: Date
  readonly status: 'CREATED' | 'ALREADY_EXISTS'
  readonly repositoryVersion: string
}

export interface ExperienceWriter {
  initialize(): Promise<void>
  append(record: ExperienceRecord): Promise<RepositoryCommit>
  close(): Promise<void>
}

// ponytail: ExperienceReader stub — Stage 11C fills this in
export interface ExperienceReader {}

export interface ExperienceStoredPayload {
  readonly experienceId: string
  readonly commit: RepositoryCommit
}

export interface ExperienceStoreFailedPayload {
  readonly experienceId: string
  readonly reason: string
  readonly retryCount: number
  readonly timestamp: Date
}

export class ExperiencePersistenceError extends Error {
  constructor(
    message: string,
    public readonly experienceId: string,
    public readonly retryCount: number,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ExperiencePersistenceError'
  }
}

export const ExperienceStoreEvent = Object.freeze({
  EXPERIENCE_STORED: 'EXPERIENCE_STORED',
  EXPERIENCE_STORE_FAILED: 'EXPERIENCE_STORE_FAILED',
} as const)
export type ExperienceStoreEvent = typeof ExperienceStoreEvent[keyof typeof ExperienceStoreEvent]
