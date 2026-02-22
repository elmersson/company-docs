# Phase 2 - StructuredChangeSet Model

**Duration:** 1-2 days
**Dependencies:** Phase 1 (contracts defined)
**Outcome:** The differ that converts two extraction snapshots into a StructuredChangeSet

---

## Objective

Build the diffing logic that compares a BASE extraction (before the PR) with a HEAD extraction (after the PR) and produces a `StructuredChangeSet`. This is the critical translation layer:

```
Raw code (BASE) --> Extraction --> |
                                   |--> Differ --> StructuredChangeSet
Raw code (HEAD) --> Extraction --> |
```

Claude never sees raw diffs. Claude only sees the `StructuredChangeSet`.

---

## How Diffing Works

### Extraction Snapshot

Each extraction run produces an `ExtractionSnapshot`:

```typescript
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
```

### Diff Algorithm

For each entity type, the differ performs set operations:

```
ADDED   = entities in HEAD but not in BASE
REMOVED = entities in BASE but not in HEAD
UPDATED = entities in both, but with different properties
```

**Entity keys (how we match entities across snapshots):**

| Entity | Key | Example |
|---|---|---|
| Route | `{method} {path}` | `POST /loan/apply` |
| Model | `{name}` | `LoanApplicationDto` |
| Event | `{name}` | `LoanCreatedEvent` |
| Table | `{table}` | `LoanApplication` |
| API Call | `{method} {url}` | `POST /api/loan/apply` |

### Differ Implementation

```typescript
// packages/docs-extractor/src/differ.ts

import type {
  ExtractionSnapshot,
  StructuredChangeSet,
  RouteChange,
  ModelChange,
  EventChange,
} from "./types"

/**
 * Diff two extraction snapshots to produce a StructuredChangeSet.
 *
 * @param base - Extraction from the base branch (before PR)
 * @param head - Extraction from the head branch (after PR)
 * @param meta - PR metadata (service name, repo, PR number, etc.)
 */
export function diffExtractions(
  base: ExtractionSnapshot,
  head: ExtractionSnapshot,
  meta: {
    service: string
    sourceRepo: string
    prNumber: number
    baseBranch: string
    headBranch: string
    headSha: string
  }
): StructuredChangeSet {
  return {
    ...meta,
    api: diffRoutes(base.routes, head.routes),
    models: diffModels(base.models, head.models),
    events: diffEvents(base.events, head.events),
    schema: diffTables(base.tables, head.tables),
    frontendApiCalls: base.apiCalls || head.apiCalls
      ? diffApiCalls(base.apiCalls ?? [], head.apiCalls ?? [])
      : undefined,
  }
}

function diffRoutes(
  base: RouteChange[],
  head: RouteChange[]
) {
  const baseMap = new Map(base.map(r => [`${r.method} ${r.path}`, r]))
  const headMap = new Map(head.map(r => [`${r.method} ${r.path}`, r]))

  const added = head.filter(r => !baseMap.has(`${r.method} ${r.path}`))
  const removed = base.filter(r => !headMap.has(`${r.method} ${r.path}`))
  const updated = head.filter(r => {
    const key = `${r.method} ${r.path}`
    const baseRoute = baseMap.get(key)
    if (!baseRoute) return false
    return (
      r.requestDto !== baseRoute.requestDto ||
      r.responseDto !== baseRoute.responseDto
    )
  })

  return { added, updated, removed }
}

// Similar implementations for diffModels, diffEvents, diffTables, diffApiCalls
```

### Model Diffing (Detailed)

Model diffing is the most complex because we diff at the field level:

```typescript
function diffModels(
  base: ModelChange[],
  head: ModelChange[]
) {
  const baseMap = new Map(base.map(m => [m.name, m]))
  const headMap = new Map(head.map(m => [m.name, m]))

  const added = head.filter(m => !baseMap.has(m.name))
  const removed = base.filter(m => !headMap.has(m.name))

  const updated: ModelChange[] = []
  for (const [name, headModel] of headMap) {
    const baseModel = baseMap.get(name)
    if (!baseModel) continue

    // Compare fields
    const baseFields = new Map(baseModel.fields.map(f => [f.name, f]))
    const headFields = new Map(headModel.fields.map(f => [f.name, f]))

    const changedFields = headModel.fields.map(field => {
      const baseField = baseFields.get(field.name)
      if (!baseField) {
        return field // new field
      }
      if (field.type !== baseField.type || field.optional !== baseField.optional) {
        return {
          ...field,
          previousType: baseField.type,
          previousOptional: baseField.optional,
        }
      }
      return null
    }).filter(Boolean)

    // Check for removed fields
    const removedFields = baseModel.fields
      .filter(f => !headFields.has(f.name))

    if (changedFields.length > 0 || removedFields.length > 0) {
      updated.push({
        name,
        fields: [...changedFields, ...removedFields],
        sourceFile: headModel.sourceFile,
      })
    }
  }

  return { added, updated, removed }
}
```

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Route path renamed | Shows as one removal + one addition |
| Model renamed | Shows as one removal + one addition (no rename detection) |
| Field reordered only | Not detected as a change (correct behavior) |
| Type alias resolved differently | Compared by string representation |
| Empty changeset | Valid output — PR made no extractable changes. No docs PR created. |

---

## Output Example

For a PR that adds an `employmentStatus` field to `LoanApplicationDto` and a new route:

```json
{
  "service": "loan-api",
  "sourceRepo": "your-org/loan-api",
  "prNumber": 482,
  "baseBranch": "main",
  "headBranch": "feature/add-employment-check",
  "headSha": "abc123",
  "api": {
    "added": [
      {
        "method": "GET",
        "path": "/loan/employment-status/:id",
        "responseDto": "EmploymentStatusDto",
        "sourceFile": "src/routes/loan.ts",
        "sourceLine": 45
      }
    ],
    "updated": [],
    "removed": []
  },
  "models": {
    "added": [],
    "updated": [
      {
        "name": "LoanApplicationDto",
        "fields": [
          {
            "name": "employmentStatus",
            "type": "EmploymentStatus",
            "optional": false
          }
        ],
        "sourceFile": "src/dto/loan.ts"
      }
    ],
    "removed": []
  },
  "events": {
    "added": [],
    "updated": [],
    "removed": []
  },
  "schema": {
    "added": [],
    "updated": [
      {
        "table": "LoanApplication",
        "columns": {
          "added": [{ "name": "employmentStatus", "type": "String" }],
          "removed": [],
          "modified": []
        }
      }
    ],
    "removed": []
  }
}
```

---

## Acceptance Criteria

- [ ] `differ.ts` implemented with all entity diffing functions
- [ ] Correctly identifies added, removed, and updated entities
- [ ] Model diffing detects field-level changes (add, remove, type change, optional change)
- [ ] Empty changesets handled gracefully
- [ ] Unit tests cover all diff scenarios (see `13-testing-strategy.md`)
- [ ] Output conforms to `StructuredChangeSet` type
