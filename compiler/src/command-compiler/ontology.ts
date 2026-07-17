const VERB_MAP: Record<string, string> = {
  install: 'install', add: 'install', get: 'install', setup: 'install',
  uninstall: 'uninstall', remove: 'uninstall',
  list: 'list', show: 'list', display: 'list',
  search: 'search', find: 'search',
  inspect: 'inspect',
  discover: 'discover', scan: 'discover', detect: 'discover',
  doctor: 'doctor', diagnose: 'doctor', check: 'doctor',
  benchmark: 'benchmark',
  run: 'run', execute: 'run',
  upgrade: 'upgrade', update: 'upgrade',
  version: 'version',
  ask: 'ask',
  info: 'info',
}

export type OntologyTargetType = 'system-tool' | 'capability' | 'subsystem' | 'pack'

export interface OntologyTarget {
  readonly type: OntologyTargetType
  readonly id: string
}

const STATIC_TARGET_MAP: Record<string, OntologyTarget> = {
  python:       { type: 'system-tool', id: 'python' },
  node:         { type: 'system-tool', id: 'node' },
  git:          { type: 'system-tool', id: 'git' },
  docker:       { type: 'system-tool', id: 'docker' },
  java:         { type: 'system-tool', id: 'java' },
  go:           { type: 'system-tool', id: 'go' },
  rust:         { type: 'system-tool', id: 'rust' },
  dotnet:       { type: 'system-tool', id: 'dotnet' },
  ollama:       { type: 'system-tool', id: 'ollama' },
  vscode:       { type: 'system-tool', id: 'vscode' },
  'vs code':    { type: 'system-tool', id: 'vscode' },
  gh:           { type: 'system-tool', id: 'gh' },
  kubectl:      { type: 'system-tool', id: 'kubectl' },
  terraform:    { type: 'system-tool', id: 'terraform' },
  ffmpeg:       { type: 'system-tool', id: 'ffmpeg' },
  corpus:       { type: 'subsystem', id: 'corpus' },
  host:         { type: 'subsystem', id: 'host' },
  'starter-pack': { type: 'pack', id: '@rohinik-org/starter-pack' },
}

const RUNTIME_TARGET_MAP = new Map<string, OntologyTarget>()

export class CommandOntology {
  static resolveVerb(verb: string): string | null {
    return VERB_MAP[verb.toLowerCase()] ?? null
  }

  static resolveTarget(noun: string): OntologyTarget | null {
    const key = noun.toLowerCase()
    return STATIC_TARGET_MAP[key] ?? RUNTIME_TARGET_MAP.get(key) ?? null
  }

  static registerTarget(noun: string, target: OntologyTarget): void {
    RUNTIME_TARGET_MAP.set(noun.toLowerCase(), target)
  }

  static isKnownVerb(verb: string): boolean {
    return verb.toLowerCase() in VERB_MAP
  }

  static isKnownTarget(noun: string): boolean {
    const key = noun.toLowerCase()
    return key in STATIC_TARGET_MAP || RUNTIME_TARGET_MAP.has(key)
  }
}
