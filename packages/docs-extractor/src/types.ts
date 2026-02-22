/**
 * Types for the docs-extractor package.
 *
 * These types mirror the canonical contracts in ../../contracts/.
 * They are defined locally to avoid TypeScript rootDir issues with
 * cross-package type imports in a monorepo without a build step.
 */

// --- Route types ---

export type RouteChange = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  requestDto?: string
  responseDto?: string
  middleware?: string[]
  sourceFile: string
  sourceLine: number
}

// --- Field & Model types ---

export type FieldChange = {
  name: string
  type: string
  optional: boolean
  previousType?: string
  previousOptional?: boolean
}

export type ModelChange = {
  name: string
  fields: FieldChange[]
  sourceFile: string
}

// --- Event types ---

export type EventChange = {
  name: string
  payload?: string
  channel?: string
  sourceFile: string
}

// --- Schema types ---

export type ColumnChange = {
  name: string
  type: string
}

export type ColumnModification = {
  name: string
  from: string
  to: string
}

export type TableChange = {
  table: string
  columns: {
    added: ColumnChange[]
    removed: ColumnChange[]
    modified: ColumnModification[]
  }
}

// --- Frontend API call types ---

export type FrontendApiCall = {
  url: string
  method: string
  requestDto?: string
  responseDto?: string
  sourceFile: string
}

// --- Main StructuredChangeSet ---

export type StructuredChangeSet = {
  service: string
  sourceRepo: string
  prNumber: number
  baseBranch: string
  headBranch: string
  headSha: string
  api: {
    added: RouteChange[]
    updated: RouteChange[]
    removed: RouteChange[]
  }
  models: {
    added: ModelChange[]
    updated: ModelChange[]
    removed: ModelChange[]
  }
  events: {
    added: EventChange[]
    updated: EventChange[]
    removed: EventChange[]
  }
  schema: {
    added: TableChange[]
    updated: TableChange[]
    removed: TableChange[]
  }
  frontendApiCalls?: {
    added: FrontendApiCall[]
    removed: FrontendApiCall[]
    updated: FrontendApiCall[]
  }
}

// --- Flow types ---

export type FlowMatch = {
  flowName: string
  frontendService: string
  backendService: string
  frontendCall: FrontendApiCall
  backendRoute: RouteChange
  requestDto?: ModelChange
  responseDto?: ModelChange
  events: EventChange[]
}

// --- Breaking change types ---

export type BreakingChange = {
  type:
    | "field-removed"
    | "field-type-changed"
    | "route-removed"
    | "event-removed"
    | "nullable-to-required"
    | "required-field-added"
  entity: string
  field?: string
  details: string
  severity: "critical" | "warning"
  affectedConsumers?: string[]
}

export type BreakingChangeReport = {
  service: string
  sourceRepo: string
  prNumber: number
  changes: BreakingChange[]
  generatedAt: string
}

// --- DocFragment ---

export type DocFragment = {
  service: string
  docType: "api" | "model" | "event" | "flow" | "breaking-change"
  entity: string
  sourceRepo: string
  sourcePr: number
  html: string
  generatedAt: string
  commitSha: string
  hasBreakingChanges: boolean
  outputPath: string
}

// --- Phase 2: ExtractionSnapshot ---

/**
 * ExtractionSnapshot represents the output of a single extraction run.
 * The differ compares a BASE snapshot with a HEAD snapshot to produce
 * a StructuredChangeSet.
 */
export type ExtractionSnapshot = {
  /** All routes found in the codebase */
  routes: RouteChange[]

  /** All exported models/interfaces/types */
  models: ModelChange[]

  /** All events being published */
  events: EventChange[]

  /** All Prisma schema tables (if applicable) */
  tables: TableChange[]

  /** All frontend API calls (if frontend repo) */
  apiCalls?: FrontendApiCall[]
}
