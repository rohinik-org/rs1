import { createInterface } from 'node:readline'
import { SlashCommandRegistry } from './slash-commands.js'
import type { InteractionHistory } from '@rohinik-org/runtime-state'

const BANNER = `
  ██████╗  ██████╗ ██╗  ██╗██╗███╗   ██╗██╗██╗  ██╗
  ██╔══██╗██╔═══██╗██║  ██║██║████╗  ██║██║██║ ██╔╝
  ██████╔╝██║   ██║███████║██║██╔██╗ ██║██║█████╔╝
  ██╔══██╗██║   ██║██╔══██║██║██║╚██╗██║██║██╔═██╗
  ██║  ██║╚██████╔╝██║  ██║██║██║ ╚████║██║██║  ██╗
  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝
  Runtime Shell  v0.1.0-beta  —  Type /help for commands
`.trimStart()

export interface ShellOptions {
  history?: InteractionHistory
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
  prompt?: string
}

export class RohinikShell {
  private readonly slashCmds = new SlashCommandRegistry()
  private readonly history: InteractionHistory | undefined
  private readonly input: NodeJS.ReadableStream
  private readonly output: NodeJS.WritableStream
  private readonly prompt: string

  constructor(opts: ShellOptions = {}) {
    this.history = opts.history
    this.input = opts.input ?? process.stdin
    this.output = opts.output ?? process.stdout
    this.prompt = opts.prompt ?? 'rhk> '
  }

  showBanner(): void {
    this.output.write(BANNER + '\n')
  }

  async run(): Promise<void> {
    this.showBanner()
    const rl = createInterface({ input: this.input, output: this.output, prompt: this.prompt })
    rl.prompt()
    return new Promise<void>((resolve) => {
      rl.on('line', (line) => {
        const input = line.trim()
        if (!input) { rl.prompt(); return }

        // slash command
        const slashResult = this.slashCmds.dispatch(input)
        if (slashResult !== null) {
          this.output.write(slashResult + '\n')
          rl.prompt()
          return
        }

        // history recall (↑ is handled by readline natively via terminal history)
        this.output.write(`[no runtime connected] echo: ${input}\n`)
        rl.prompt()
      })
      rl.on('close', () => resolve())
    })
  }

  get commands(): SlashCommandRegistry {
    return this.slashCmds
  }
}
