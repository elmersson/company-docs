// --- Subtypes ---

export type RouteChange = {
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

  /** Route path (e.g. "/loan/apply") */
  path: string

  /** Request DTO name (if detected) */
  requestDto?: string

  /** Response DTO name (if detected) */
  responseDto?: string

  /** Middleware chain (e.g. ["auth", "validate"]) */
  middleware?: string[]

  /** File where this route is defined */
  sourceFile: string

  /** Line number in source file */
  sourceLine: number
}

export type FieldChange = {
  /** Field name */
  name: string

  /** TypeScript type (e.g. "string", "number", "EmploymentStatus") */
  type: string

  /** Whether the field is optional (has ?) */
  optional: boolean

  /** Previous type (only for updates) */
  previousType?: string

  /** Previous optional state (only for updates) */
  previousOptional?: boolean
}

export type ModelChange = {
  /** Interface/type name */
  name: string

  /** All fields on this model */
  fields: FieldChange[]

  /** File where this model is defined */
  sourceFile: string
}

export type EventChange = {
  /** Event class name (e.g. "LoanCreatedEvent") */
  name: string

  /** Payload DTO name (if detected) */
  payload?: string

  /** Channel/topic name (if detected) */
  channel?: string

  /** File where this event is published */
  sourceFile: string
}

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
  /** Table/model name */
  table: string

  columns: {
    added: ColumnChange[]
    removed: ColumnChange[]
    modified: ColumnModification[]
  }
}

export type FrontendApiCall = {
  /** URL being called (e.g. "/api/loan/apply") */
  url: string

  /** HTTP method */
  method: string

  /** Request DTO used (if detected) */
  requestDto?: string

  /** Response DTO used (if detected) */
  responseDto?: string

  /** File where this call is made */
  sourceFile: string
}

// --- Flow types ---

/**
 * A detected cross-service flow matching a frontend API call
 * to a backend route, with related DTOs and events.
 */
export type FlowMatch = {
  /** Generated flow name (e.g. "CreateLoanFlow") */
  flowName: string

  /** Frontend service that initiates the call */
  frontendService: string

  /** Backend service that handles the request */
  backendService: string

  /** The frontend API call */
  frontendCall: FrontendApiCall

  /** The matching backend route */
  backendRoute: RouteChange

  /** Request DTO (if detected) */
  requestDto?: ModelChange

  /** Response DTO (if detected) */
  responseDto?: ModelChange

  /** Events emitted by the backend handler */
  events: EventChange[]
}

// --- Main Type ---

/**
 * StructuredChangeSet is the complete diff output from the extractor.
 * This is what Claude receives - never raw git diffs.
 */
export type StructuredChangeSet = {
  /** Service name */
  service: string

  /** Source repository (e.g. "your-org/loan-api") */
  sourceRepo: string

  /** PR number */
  prNumber: number

  /** Base branch (e.g. "main") */
  baseBranch: string

  /** Head branch (e.g. "feature/add-employment-check") */
  headBranch: string

  /** Commit SHA of head */
  headSha: string

  /** API route changes */
  api: {
    added: RouteChange[]
    updated: RouteChange[]
    removed: RouteChange[]
  }

  /** Model/DTO changes */
  models: {
    added: ModelChange[]
    updated: ModelChange[]
    removed: ModelChange[]
  }

  /** Event changes */
  events: {
    added: EventChange[]
    updated: EventChange[]
    removed: EventChange[]
  }

  /** Database schema changes (Prisma) */
  schema: {
    added: TableChange[]
    updated: TableChange[]
    removed: TableChange[]
  }

  /**
   * Frontend API call changes.
   * Only populated for frontend repos (repo type = "frontend").
   */
  frontendApiCalls?: {
    added: FrontendApiCall[]
    removed: FrontendApiCall[]
    updated: FrontendApiCall[]
  }
}
