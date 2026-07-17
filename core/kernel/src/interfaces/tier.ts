import type { SelectedSkill } from '../domain/selected-skill.js'
import type { ExecutionContext } from '../domain/context.js'

export type TierId = 'MEMORY' | 'DETERMINISTIC' | 'LOCAL_TOOL' | 'EXTERNAL' | 'REASONING'

export interface Tier {
  readonly tierId: TierId
  evaluate(ctx: ExecutionContext): Promise<SelectedSkill | undefined>
}
