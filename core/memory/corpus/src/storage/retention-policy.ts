export interface RetentionPolicy {
  readonly maxAgeDays: number
  readonly maxSizeGb: number
  readonly archiveAfterDays?: number
  readonly deleteAfterDays?: number
  readonly compressArchive?: boolean
}

export const DeveloperRetentionPolicy: RetentionPolicy = {
  maxAgeDays: 7, maxSizeGb: 0.1,
}

export const DefaultRetentionPolicy: RetentionPolicy = {
  maxAgeDays: 30, maxSizeGb: 1,
}

export const EnterpriseRetentionPolicy: RetentionPolicy = {
  maxAgeDays: 365, maxSizeGb: 50,
  archiveAfterDays: 90, deleteAfterDays: 365, compressArchive: true,
}

export const ForensicsRetentionPolicy: RetentionPolicy = {
  maxAgeDays: 730, maxSizeGb: 200,
}
