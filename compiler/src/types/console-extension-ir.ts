import type { ConsoleFeature } from './console-core-ir.js'

export type ConsolePermission =
  | 'VIEW_EXECUTIONS' | 'VIEW_MEMORY' | 'VIEW_REASONING'
  | 'VIEW_CLUSTER' | 'VIEW_PROVIDERS'
  | 'CAPTURE_SNAPSHOT' | 'RESTORE_SNAPSHOT' | 'EXPORT_GRAPH'
  | 'MANAGE_WORKSPACE' | 'LOAD_EXTENSION'

export interface ConsolePermissionPolicy {
  readonly policyId: string
  readonly granted: readonly ConsolePermission[]
}

export type ExtensionPoint =
  | 'panel' | 'command' | 'menu' | 'toolbar'
  | 'widget' | 'graph-overlay' | 'timeline-decorator'
  | 'theme' | 'chat-panel'     // chat-panel reserved for Stage 9+ AI assistant integration

export interface ExtensionContribution {
  readonly contributionId: string
  readonly extensionId: string
  readonly point: ExtensionPoint
  readonly label: string
  readonly requiredFeatures?: readonly ConsoleFeature[]
  readonly requiredPermissions?: readonly ConsolePermission[]
}

export interface ExtensionDescriptor {
  readonly extensionId: string
  readonly label: string
  readonly version: string
  readonly contributions: readonly ExtensionContribution[]
}

export interface ExtensionManifest {
  readonly manifestId: string
  readonly extensions: readonly ExtensionDescriptor[]
  readonly publishedAt: string
}

// ExtensionState: lifecycle state for Marketplace visibility and diagnostics.
export type ExtensionState =
  | 'Inactive'      // registered but not yet activated
  | 'Activating'    // activate() in progress (validate + mount phases)
  | 'Active'        // all contributions mounted successfully
  | 'Failed'        // activation threw; contributions rolled back
  | 'Disabled'      // user-disabled or policy-disabled; contributions unmounted
