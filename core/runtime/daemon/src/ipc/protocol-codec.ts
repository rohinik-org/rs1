import type { RuntimeCommand, RuntimeResponse } from '@rohinik-org/compiler'

export type ProtocolMessage = RuntimeCommand | RuntimeResponse

export class ProtocolCodec {
  encode(msg: ProtocolMessage): string {
    return JSON.stringify(msg) + '\n'
  }

  decode(line: string): ProtocolMessage {
    const trimmed = line.trim()
    if (!trimmed) throw new Error('Empty line')
    const parsed: unknown = JSON.parse(trimmed)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('Expected object')
    return parsed as ProtocolMessage
  }
}
