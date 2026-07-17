import type { ClarificationIR } from '@rohinik-org/compiler'

export interface UserIO {
  ask(question: string, choices?: readonly string[]): Promise<string>
  print(message: string): void
}

export class ConsoleClarificationHandler {
  constructor(private readonly io: UserIO) {}

  async handle(clarification: ClarificationIR): Promise<Record<string, string>> {
    this.io.print(`\n[Clarification needed — ${clarification.reason.type}]`)
    this.io.print(clarification.reason.description)
    const answers: Record<string, string> = {}
    for (const question of clarification.questions) {
      const answer = await this.io.ask(question.text, question.choices)
      answers[question.questionId] = answer
    }
    return answers
  }
}
