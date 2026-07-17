import type { Goal, GoalStatus, LoopJournalEntry, AutonomyReport } from '@rohinik-org/compiler'

export interface LoopStore {
  saveGoal(goal: Goal): Promise<void>
  loadGoal(goalId: string): Promise<Goal | undefined>
  listGoals(status?: GoalStatus): Promise<Goal[]>
  saveJournalEntry(entry: LoopJournalEntry): Promise<void>
  listJournal(loopId: string): Promise<LoopJournalEntry[]>
  saveReport(report: AutonomyReport): Promise<void>
  loadReport(loopId: string): Promise<AutonomyReport | undefined>
}

export class NullLoopStore implements LoopStore {
  async saveGoal(): Promise<void> {}
  async loadGoal(): Promise<undefined> { return undefined }
  async listGoals(): Promise<Goal[]> { return [] }
  async saveJournalEntry(): Promise<void> {}
  async listJournal(): Promise<LoopJournalEntry[]> { return [] }
  async saveReport(): Promise<void> {}
  async loadReport(): Promise<undefined> { return undefined }
}

export class InMemoryLoopStore implements LoopStore {
  private readonly goals = new Map<string, Goal>()
  private readonly journal: LoopJournalEntry[] = []
  private readonly reports = new Map<string, AutonomyReport>()

  async saveGoal(goal: Goal): Promise<void> { this.goals.set(goal.goalId, goal) }
  async loadGoal(goalId: string): Promise<Goal | undefined> { return this.goals.get(goalId) }
  async listGoals(status?: GoalStatus): Promise<Goal[]> {
    const all = Array.from(this.goals.values())
    return status ? all.filter(g => g.status === status) : all
  }
  async saveJournalEntry(entry: LoopJournalEntry): Promise<void> { this.journal.push(entry) }
  async listJournal(loopId: string): Promise<LoopJournalEntry[]> {
    return this.journal.filter(e => e.loopId === loopId)
  }
  async saveReport(report: AutonomyReport): Promise<void> { this.reports.set(report.loopId, report) }
  async loadReport(loopId: string): Promise<AutonomyReport | undefined> { return this.reports.get(loopId) }
}
