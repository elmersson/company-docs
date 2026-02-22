# Phase 1 - Documentation Contract (Foundation)

**Duration:** 1-2 days
**Dependencies:** Phase 0 (pilot repos identified)
**Outcome:** Shared type contracts that define the ABI of the documentation system

---

## Objective

Define the type contracts that every component in the system uses. These contracts are the single source of truth for:

- What data the extractor produces
- What data Claude receives as input
- What data Claude outputs
- What the Astro site consumes

If these types are wrong, everything downstream is wrong. Get them right first.

---

## Deliverables

### 1. `contracts/DocFragment.ts`

The output unit of the documentation system. Each DocFragment represents one page/section in the generated docs.

```typescript
/**
 * DocFragment is the atomic unit of generated documentation.
 * Each fragment maps to one HTML file in the services/ directory.
 *
 * This is the ABI of the documentation system - all components
 * must agree on this type.
 */
export type DocFragment = {
  /** Service name (e.g. "loan-api", "web-checkout") */
  service: string

  /** Type of documentation this fragment represents */
  docType: "api" | "model" | "event" | "flow" | "breaking-change"

  /** Entity name (e.g. "POST /loan/apply", "LoanApplicationDto") */
  entity: string

  /** Source repository (e.g. "your-org/loan-api") */
  sourceRepo: string

  /** PR number that generated this fragment */
  sourcePr: number

  /** Generated HTML content (fragment, no <html>/<body> wrapper) */
  html: string

  /** ISO 8601 timestamp of generation */
  generatedAt: string

  /** SHA of the commit that generated this fragment */
  commitSha: string

  /** Whether this fragment contains breaking changes */
  hasBreakingChanges: boolean

  /**
   * Output file path relative to services/ directory.
   * Example: "loan-api/api/post-loan-apply.html"
   */
  outputPath: string
}
```

### 2. `contracts/StructuredChangeSet.ts`

The input to Claude. This is what the extractor produces and what Claude sees — never raw diffs.

```typescript
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
```

### 3. `contracts/BreakingChange.ts`

Breaking changes detected by the rule engine (no LLM involved).

```typescript
/**
 * BreakingChange represents a detected backward-incompatible change.
 * Detected by deterministic rules, not by the LLM.
 */
export type BreakingChange = {
  /** Type of breaking change */
  type:
    | "field-removed"
    | "field-type-changed"
    | "route-removed"
    | "event-removed"
    | "nullable-to-required"
    | "required-field-added"

  /** Entity affected (e.g. "LoanApplicationDto", "POST /loan/apply") */
  entity: string

  /** Specific field affected (if applicable) */
  field?: string

  /** Human-readable description of the change */
  details: string

  /** Severity level */
  severity: "critical" | "warning"

  /**
   * Repos that consume this entity.
   * Populated by cross-referencing registry.json and existing docs.
   */
  affectedConsumers?: string[]
}

/**
 * BreakingChangeReport is the full report for a PR.
 */
export type BreakingChangeReport = {
  service: string
  sourceRepo: string
  prNumber: number
  changes: BreakingChange[]
  generatedAt: string
}
```

---

## Design Principles

1. **Contracts are immutable during a release cycle.** Adding fields is OK. Removing or renaming fields is a breaking change to the documentation system itself.

2. **All types are pure data.** No methods, no classes, no side effects. JSON-serializable.

3. **Optional fields have explicit semantics.** A field is optional only when it genuinely may not exist, not as a shortcut.

4. **Source traceability.** Every change includes `sourceFile` and `sourceLine` so docs can link back to code.

---

## Acceptance Criteria

- [ ] All three contract files created in `contracts/`
- [ ] Types compile without errors (`tsc --noEmit`)
- [ ] Types are JSON-serializable (no functions, classes, or circular refs)
- [ ] Types cover all extraction scenarios from Phase 3
- [ ] Types reviewed by at least one other developer
