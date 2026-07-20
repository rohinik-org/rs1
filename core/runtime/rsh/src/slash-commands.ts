export interface SlashCommand {
  readonly name: string
  readonly description: string
  handle(args: string[]): string
}

export class SlashCommandRegistry {
  private readonly commands = new Map<string, SlashCommand>()

  constructor() {
    this._registerBuiltins()
  }

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd)
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name)
  }

  list(): ReadonlyArray<SlashCommand> {
    return Array.from(this.commands.values())
  }

  dispatch(input: string): string | null {
    if (!input.startsWith('/')) return null
    const [rawName, ...args] = input.slice(1).split(' ')
    const name = rawName ?? ''
    const cmd = this.commands.get(name)
    if (!cmd) return `Unknown command: /${name}. Type /help for a list.`
    return cmd.handle(args)
  }

  private _registerBuiltins(): void {
    const self = this
    this.register({
      name: 'help',
      description: 'Show available commands',
      handle: () => {
        const lines = Array.from(self.commands.values()).map(c => `  /${c.name.padEnd(16)} ${c.description}`)
        return lines.join('\n')
      },
    })
    this.register({ name: 'clear', description: 'Clear the screen', handle: () => '\x1b[2J\x1b[H' })
    this.register({ name: 'exit', description: 'Exit the shell', handle: () => { process.exit(0); return '' } })
    this.register({ name: 'version', description: 'Show runtime version', handle: () => '0.1.0-beta' })
    this.register({
      name: 'status',
      description: 'Show runtime status',
      handle: () => 'Runtime: READY',
    })
  }
}
