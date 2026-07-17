import type { AgentMessage } from '@rohinik-org/compiler'

type Handler = (msg: AgentMessage) => void

export class AgentCommunicationBus {
  private readonly handlers = new Map<string, Map<string, Handler>>()
  private readonly journal: AgentMessage[] = []
  private nextSubId = 0

  subscribe(recipientAgentId: string, handler: Handler): string {
    const id = `sub-${++this.nextSubId}`
    if (!this.handlers.has(recipientAgentId)) this.handlers.set(recipientAgentId, new Map())
    this.handlers.get(recipientAgentId)!.set(id, handler)
    return id
  }

  publish(senderAgentId: string, recipientAgentId: string, payload: unknown): AgentMessage {
    const msg: AgentMessage = {
      messageId: crypto.randomUUID(),
      senderAgentId,
      recipientAgentId,
      payload,
      sentAt: new Date().toISOString(),
    }
    this.journal.push(msg)
    this.handlers.get(recipientAgentId)?.forEach(h => h(msg))
    return msg
  }

  unsubscribe(subscriptionId: string): void {
    for (const handlers of this.handlers.values()) {
      if (handlers.delete(subscriptionId)) return
    }
  }

  getJournal(): readonly AgentMessage[] { return this.journal }
  clear(): void { this.handlers.clear(); this.journal.length = 0 }
}
