import type { SdkCapability, SdkCapabilityMetadata, Runtime } from '@rohinik-org/foundation'
import { CsvParseSkill } from './csv/csv.skill.js'
import { JsonParseSkill } from './json/json.skill.js'
import { MathAddSkill, MathSubtractSkill, MathMultiplySkill, MathDivideSkill } from './math/math.skills.js'
import { RegexExtractSkill } from './regex/regex.skill.js'
import { SortSkill } from './sort/sort.skill.js'
import { ReasoningSkill } from './reasoning/reasoning.skill.js'

const CORE_METADATA: SdkCapabilityMetadata = {
  capabilityId: 'capability-core',
  name: 'Rohinik Core Capabilities',
  version: '0.1.0',
  contractVersion: '1.0',
  description: 'Deterministic data processing capabilities: CSV, JSON, Math, Regex, Sort',
  category: 'data',
  tags: ['csv', 'json', 'math', 'regex', 'sort', 'deterministic'],
  execution: { tierId: 'DETERMINISTIC' },
}

const REASONING_METADATA: SdkCapabilityMetadata = {
  capabilityId: 'builtin:reasoning',
  name: 'Built-in Reasoning',
  version: '1.0.0',
  contractVersion: '1.0',
  description: 'Catch-all reasoning capability backed by the configured provider',
  category: 'reasoning',
  tags: ['builtin', 'reasoning'],
  execution: { tierId: 'REASONING' },
}

export function buildCoreCapability(): SdkCapability {
  return {
    metadata: CORE_METADATA,
    skills: [
      new CsvParseSkill(),
      new JsonParseSkill(),
      new MathAddSkill(),
      new MathSubtractSkill(),
      new MathMultiplySkill(),
      new MathDivideSkill(),
      new RegexExtractSkill(),
      new SortSkill(),
    ],
  }
}

export function buildReasoningCapability(): SdkCapability {
  return {
    metadata: REASONING_METADATA,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skills: [new ReasoningSkill() as any],
  }
}

export function activate(runtime: Runtime): void {
  runtime.registerCapability(buildCoreCapability())
  runtime.registerCapability(buildReasoningCapability())
}
