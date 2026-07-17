// ── Layout IR ─────────────────────────────────────────────────────────────
export type PanelId = string

export interface LayoutPanel {
  readonly panelId: PanelId
  readonly label: string
  readonly visible: boolean
  readonly order: number
}

export interface LayoutDefinition {
  readonly layoutId: string
  readonly primarySidebarWidthPx: number   // left sidebar; future: secondarySidebarWidthPx
  readonly panels: readonly LayoutPanel[]
  readonly activePanelId: PanelId | null
  readonly openTabIds: readonly string[]
}

// ── Workspace IR ──────────────────────────────────────────────────────────
export type WorkspaceId = string
export type WorkspaceRevision = number   // alias: if bigint or branded type ever needed, only this changes

export interface WorkspaceDefinition {
  readonly workspaceId: WorkspaceId
  readonly revision: WorkspaceRevision   // increments on every save
  readonly parentRevision?: WorkspaceRevision  // reserved: enables merge/conflict detection for multi-console edits
  readonly schemaVersion: number         // serialization format version
  readonly name: string
  readonly layoutId: string
  readonly themeId: string
  readonly activePanels: readonly PanelId[]
  readonly openTabIds: readonly string[]
  readonly daemonUrl?: string
  readonly viewport?: WorkspaceViewport  // preserves graph zoom/pan/camera on workspace reopen
  readonly tags?: readonly string[]      // categorization for marketplace, enterprise, cloud views
  readonly metadata?: Record<string, unknown>  // reserved: marketplace/enterprise workspace metadata
  readonly createdAt: string
  readonly updatedAt: string
}

// Schema evolution loading rules:
//   same version   → load as-is
//   older version  → run migration chain to current schemaVersion
//   newer version  → reject gracefully (log 'WORKSPACE_SCHEMA_MISMATCH' at 'error' level)

export interface WorkspaceViewport {
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
  readonly activePanelId?: PanelId     // panel focused when workspace was saved
}

// ── Theme IR ──────────────────────────────────────────────────────────────
export type ThemeId = string

export interface ThemeColorTokens {
  readonly background: string; readonly surface: string; readonly border: string
  readonly textPrimary: string; readonly textSecondary: string; readonly textMuted: string
  readonly accentPrimary: string; readonly accentSecondary: string
  readonly success: string; readonly warning: string; readonly error: string; readonly info: string
}

export interface ThemeTypography {
  readonly fontFamily: string
  readonly fontSizeBase: string; readonly fontSizeSm: string; readonly fontSizeLg: string
  readonly lineHeight: string
}

export interface ThemeSpacing {
  readonly xs: string; readonly sm: string; readonly md: string
  readonly lg: string; readonly xl: string
}

export interface ThemeDefinition {
  readonly themeId: ThemeId
  readonly name: string
  readonly colors: ThemeColorTokens
  readonly typography: ThemeTypography
  readonly spacing: ThemeSpacing
}

// ThemeSnapshot: produced by ThemeEngine; consumed by ThemeApplierDOM or any renderer.
// ReadonlyMap preserves ordering and is renderer-independent.
// No generatedAt: identical ThemeDefinition → identical ThemeSnapshot (CONSOLE-014).
// version: monotonic counter; renderers skip re-apply when version unchanged.
// hash: deterministic comparison — two identical ThemeDefinitions produce identical hashes.
// INVARIANT: cssVariables entry order MUST be deterministic (insertion order from ThemeEngine).
// If ThemeEngine changes iteration order, hash and deterministic rendering both break.
export interface ThemeSnapshot {
  readonly themeId: ThemeId
  readonly version: number                     // increments on each load(); skip DOM re-apply if unchanged
  readonly hash: string                        // hash(themeId + cssVariables entries)
  readonly cssVariables: ReadonlyMap<string, string>  // '--color-background' → '#0d0d0d'
}

// ── Notification IR ───────────────────────────────────────────────────────
export type NotificationPriority = 'info' | 'warning' | 'error' | 'critical'

export interface ConsoleNotification {
  readonly notificationId: string
  readonly priority: NotificationPriority
  readonly title: string
  readonly message?: string
  readonly timestamp: string
  readonly expiresAt?: string              // ISO timestamp; for persistence/reconnect restore — not for timers
  readonly workspaceId?: string
  readonly actions?: readonly { readonly label: string; readonly actionId: string }[]
}

// ── Console Activity Log IR ───────────────────────────────────────────────
// UI audit trail. Written by CommandRuntime, SelectionManager, WorkspaceManager,
// NotificationCenter. MUST NOT influence runtime state or projections (CONSOLE-012).

export type ConsoleActivityLevel = 'info' | 'warning' | 'error'

export type ConsoleActivityEventType =
  | 'VIEW_OPENED'
  | 'COMMAND_EXECUTED'
  | 'LAYOUT_CHANGED'
  | 'SEARCH_PERFORMED'
  | 'SNAPSHOT_CAPTURED'
  | 'SNAPSHOT_RESTORED'
  | 'WORKSPACE_CHANGED'
  | 'SELECTION_CHANGED'
  | 'NOTIFICATION_SHOWN'
  | 'EXTENSION_LOADED'
  | 'EXTENSION_UNLOADED'
  | 'PERMISSION_DENIED'
  | 'WORKSPACE_SCHEMA_MISMATCH'

export interface ConsoleActivityEntry {
  readonly entryId: string
  readonly eventType: ConsoleActivityEventType
  readonly level: ConsoleActivityLevel
  readonly timestamp: string
  readonly sessionId: string
  readonly workspaceId?: string
  readonly payload?: unknown
}

// ── Console Event Log IR ──────────────────────────────────────────────────
// Immutable runtime event store. Source of truth for replay (CONSOLE-012).
// Written by ConnectionRuntime on every ConsoleEventBus event received.
// sequenceNumber: monotonically increasing safe integer (max 2^53-1); not uint64.
// Sequence numbers are gap-free: 1,2,3,4,5 — never 1,2,5. Replay depends on this.
export type ProjectionVersion = number   // alias: monotonically increasing; change to bigint/branded without ripple

export interface ConsoleEventLogEntry {
  readonly entryId: string
  readonly sequenceNumber: number   // monotonically increasing safe integer (max 2^53-1); not uint64
  readonly eventType: string
  readonly timestamp: string
  readonly sessionId: string
  readonly payload: unknown
}
