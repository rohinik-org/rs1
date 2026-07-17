export type HostResourceType =
  | 'binary'        // Python, Git, Node — executables on PATH
  | 'runtime'       // Ollama, LM Studio, CUDA — AI/compute runtimes
  | 'gpu'           // NVIDIA, AMD — hardware accelerators
  | 'database'      // PostgreSQL, MySQL, SQLite, Redis
  | 'container'     // Docker, Podman, Kubernetes CLI
  | 'ide'           // VS Code, Visual Studio, JetBrains
  | 'shell'         // Bash, PowerShell, zsh, cmd
  | 'browser'       // Chrome, Firefox, Edge
  | 'device'        // camera, microphone, USB, Bluetooth — Phase 6+
  | 'service'       // local HTTP services, system daemons — Phase 6+
  | 'network'       // network interfaces, VPN — Phase 6+

// Raw detection output — transient, never stored in HostInventory
export interface HostObservation {
  readonly name: string
  readonly executablePath?: string
  readonly versionRaw?: string
  readonly exitCode: number             // 0 = found
  readonly rawOutput?: string
  readonly detectedAt: string           // ISO-8601
}

export interface HostResourceRelationship {
  readonly type: 'requires' | 'contains' | 'dependsOn' | 'accelerates' | 'hosts'
  readonly targetId: string             // rohinik://host/<name>
  readonly required: boolean
}

// Rohinik-classified host resource. Stored in HostInventory.
export interface HostResource {
  readonly kind: 'HostResource'
  readonly schemaVersion: '1.0'
  readonly id: string                   // rohinik://host/<name>
  readonly name: string
  readonly displayName: string
  readonly resourceType: HostResourceType
  readonly detectedAt: string           // ISO-8601: first detected
  readonly lastVerifiedAt: string       // ISO-8601: last health-checked (Law 25)
  readonly platform: string             // 'win32' | 'linux' | 'darwin'
  readonly healthStatus: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE'
  readonly healthMessage?: string
  readonly confidence: number           // 0–1
  readonly priority: number             // 0–100: PATH binary=80, container=60
  readonly executablePath?: string
  readonly version?: string
  readonly installationSource:
    | 'winget' | 'apt' | 'brew' | 'chocolatey' | 'pacman' | 'dnf'
    | 'manual' | 'portable' | 'aios' | 'unknown'
  readonly relationships?: readonly HostResourceRelationship[]
  readonly metadata: Record<string, unknown>
}

// Complete self-portrait of the host machine.
// Reserved as a Federation advertisement artifact (Phase 8).
export interface HostInventory {
  readonly kind: 'HostInventory'
  readonly schemaVersion: '1.0'
  readonly inventoryId: string          // SHA-256 of canonical content
  readonly capturedAt: string           // ISO-8601: first built
  readonly lastUpdatedAt: string        // ISO-8601: last modified
  readonly platform: string
  readonly arch: string
  readonly nodeVersion: string
  readonly resources: readonly HostResource[]
  readonly resourceCount: number
  readonly availableCount: number
  readonly unavailableCount: number
}
