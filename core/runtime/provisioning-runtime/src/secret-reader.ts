import type {
  SecretPresenceReader,
  SecretReadinessResult,
  AuthorizedSecretRequirement,
} from '@rohinik-org/provisioning-ir'

export class SecretReader implements SecretPresenceReader {
  constructor(
    private readonly secrets: ReadonlyMap<string, string>,
  ) {}

  async has(secretName: string): Promise<boolean> {
    const value = this.secrets.get(secretName)
    return typeof value === 'string' && value.length > 0
  }

  async checkReadiness(
    requirements: readonly AuthorizedSecretRequirement[],
  ): Promise<SecretReadinessResult> {
    const missingSecretNames: string[] = []
    for (const req of requirements) {
      if (req.required && !(await this.has(req.secretName))) {
        missingSecretNames.push(req.secretName)
      }
    }
    return { allPresent: missingSecretNames.length === 0, missingSecretNames }
  }
}
