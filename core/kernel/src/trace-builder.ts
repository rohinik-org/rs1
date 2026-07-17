import type { DecisionEvent, DecisionTrace, DecisionTraceBuilder } from './domain/trace.js'

export class DefaultDecisionTraceBuilder implements DecisionTraceBuilder {
  private events: DecisionEvent[] = []
  private _reasoningInvoked = false
  private _winnerTierId: DecisionTrace['winnerTierId']
  private _winnerSkillId: DecisionTrace['winnerSkillId']

  constructor(private readonly requestId: string) {}

  append(event: DecisionEvent): void {
    this.events.push(event)
    if (event.type === 'COMPLETED') {
      this._reasoningInvoked = event.reasoningInvoked
      this._winnerTierId = event.winnerTierId
      this._winnerSkillId = event.winnerSkillId
    }
  }

  build(): DecisionTrace {
    return Object.freeze({
      requestId: this.requestId,
      events: Object.freeze([...this.events]),
      reasoningInvoked: this._reasoningInvoked,
      ...(this._winnerTierId !== undefined && { winnerTierId: this._winnerTierId }),
      ...(this._winnerSkillId !== undefined && { winnerSkillId: this._winnerSkillId }),
    })
  }
}
