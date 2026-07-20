import type { ConstitutionalIdentity, DeploymentPersona, RuntimeIdentityContext } from '@rohinik-org/compiler'

export class IdentityService {
  private readonly constitutional: ConstitutionalIdentity = {
    brand: 'Rohinik',
    role: 'Intelligent Computing Platform',
    version: '0.1.0',
  }

  constructor(
    private readonly persona: DeploymentPersona | undefined,
    private readonly listCapabilities: () => readonly string[],
    private readonly listProviders: () => readonly string[],
  ) {}

  buildContext(): RuntimeIdentityContext {
    return {
      constitutional: this.constitutional,
      ...(this.persona !== undefined && { persona: this.persona }),
      installedCapabilities: this.listCapabilities(),
      availableProviders: this.listProviders(),
      runtimeVersion: this.constitutional.version,
    }
  }

  buildSystemPrompt(): string {
    const ctx = this.buildContext()
    const name = ctx.persona?.assistantName ?? ctx.constitutional.brand
    const org = ctx.persona?.organization

    const lines: string[] = [
      `You are ${name}, ${ctx.constitutional.role}.`,
      org ? `Deployed by ${org}.` : '',
      '',
      'Installed capabilities:',
      ...ctx.installedCapabilities.map(c => `  - ${c}`),
      '',
      'Available providers:',
      ...ctx.availableProviders.map(p => `  - ${p}`),
    ]

    if (ctx.persona?.instructions) {
      lines.push('', ctx.persona.instructions)
    }

    lines.push(
      '',
      'You represent this platform. Do not introduce yourself by any other name or identity.',
    )

    return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim()
  }
}
