import { RohinikClient } from '../client/rohinik-client.js'
import type { ExperienceResponse } from '../client/types.js'

export async function fetchEvidence(
  client: RohinikClient,
  experienceId: string,
): Promise<ExperienceResponse | null> {
  try {
    return await client.getExperience(experienceId)
  } catch {
    return null
  }
}
