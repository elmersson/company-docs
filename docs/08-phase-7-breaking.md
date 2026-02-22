# Phase 7 - Breaking Change Detection

**Duration:** 2-3 days
**Dependencies:** Phase 2 (StructuredChangeSet), Phase 3 (extractor)
**Outcome:** Deterministic rule engine that detects backward-incompatible changes

---

## Objective

Detect breaking changes using deterministic rules — no LLM involved. This is a rule engine that runs on the `StructuredChangeSet` and produces `BreakingChange[]`. Claude later generates human-readable explanations of these changes, but the detection itself is 100% rule-based.

---

## Breaking Change Rules

| # | Rule | Entity | Condition | Severity |
|---|---|---|---|---|
| 1 | Field removed | Model/DTO | Field exists in base, absent in head | Critical |
| 2 | Field type changed | Model/DTO | Same field name, different type string | Critical |
| 3 | Nullable to required | Model/DTO | Field had `optional: true` in base, `optional: false` in head | Critical |
| 4 | Required field added | Model/DTO | New field with `optional: false` on an existing model | Warning |
| 5 | Route removed | API | Route exists in base, absent in head | Critical |
| 6 | Event removed | Event | Event exists in base, absent in head | Critical |
| 7 | Route method changed | API | Same path, different method | Warning |
| 8 | Request DTO changed | API | Same route, different requestDto name | Warning |

---

## Implementation

### `packages/docs-extractor/src/breaking-changes.ts`

```typescript
import type { StructuredChangeSet } from "./types"

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

/**
 * Detect breaking changes from a StructuredChangeSet.
 * Pure deterministic rules - no LLM involved.
 */
export function detectBreakingChanges(
  changeSet: StructuredChangeSet
): BreakingChange[] {
  const changes: BreakingChange[] = []

  // Rule 1: Removed routes
  for (const route of changeSet.api.removed) {
    changes.push({
      type: "route-removed",
      entity: `${route.method} ${route.path}`,
      details: `Route ${route.method} ${route.path} has been removed. Any clients calling this endpoint will receive 404 errors.`,
      severity: "critical",
    })
  }

  // Rule 2: Removed events
  for (const event of changeSet.events.removed) {
    changes.push({
      type: "event-removed",
      entity: event.name,
      details: `Event ${event.name} is no longer published. Any subscribers listening for this event will stop receiving it.`,
      severity: "critical",
    })
  }

  // Rules 3-6: Model field changes
  for (const model of changeSet.models.updated) {
    for (const field of model.fields) {
      // Rule 3: Field type changed
      if (field.previousType && field.type !== field.previousType) {
        changes.push({
          type: "field-type-changed",
          entity: model.name,
          field: field.name,
          details: `Field ${model.name}.${field.name} type changed from ${field.previousType} to ${field.type}. Clients sending the old type will fail validation.`,
          severity: "critical",
        })
      }

      // Rule 4: Nullable to required
      if (field.previousOptional === true && field.optional === false) {
        changes.push({
          type: "nullable-to-required",
          entity: model.name,
          field: field.name,
          details: `Field ${model.name}.${field.name} changed from optional to required. Clients not sending this field will fail validation.`,
          severity: "critical",
        })
      }
    }
  }

  // Rule 5: Removed fields (fields on removed models)
  for (const model of changeSet.models.removed) {
    changes.push({
      type: "field-removed",
      entity: model.name,
      details: `Model ${model.name} has been entirely removed. All fields are no longer available.`,
      severity: "critical",
    })
  }

  // Rule 5b: Removed fields on updated models
  // (fields that exist in the "updated" model's diff as removed)
  for (const model of changeSet.models.updated) {
    for (const field of model.fields) {
      // A field in the "updated" list with no type means it was removed
      // This depends on the differ marking removed fields appropriately
      if (field.previousType && !field.type) {
        changes.push({
          type: "field-removed",
          entity: model.name,
          field: field.name,
          details: `Field ${model.name}.${field.name} (was: ${field.previousType}) has been removed.`,
          severity: "critical",
        })
      }
    }
  }

  // Rule 6: Required field added to existing model
  for (const model of changeSet.models.updated) {
    for (const field of model.fields) {
      // New field (no previousType) that is required
      if (!field.previousType && !field.optional) {
        changes.push({
          type: "required-field-added",
          entity: model.name,
          field: field.name,
          details: `Required field ${model.name}.${field.name} (${field.type}) added. Existing clients not sending this field will fail validation.`,
          severity: "warning",
        })
      }
    }
  }

  // Sort by severity (critical first)
  changes.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1
    if (a.severity !== "critical" && b.severity === "critical") return 1
    return 0
  })

  return changes
}
```

---

## Cross-Repo Consumer Detection

When a breaking change is detected, we can check which other services consume the affected entity by cross-referencing existing documentation.

```typescript
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { glob } from "glob"

/**
 * Enrich breaking changes with affected consumer information.
 * Scans existing docs in services/ to find which repos reference
 * the affected entities.
 */
export async function enrichWithConsumers(
  changes: BreakingChange[],
  servicesDir: string
): Promise<BreakingChange[]> {
  // Load all metadata files
  const metaFiles = await glob(join(servicesDir, "*/_meta-*.json"))
  const allMeta: Array<{
    service: string
    entity: string
    sourceRepo: string
  }> = []

  for (const file of metaFiles) {
    const entries = JSON.parse(readFileSync(file, "utf-8"))
    allMeta.push(...entries)
  }

  // For each breaking change, find consumers
  for (const change of changes) {
    const consumers = allMeta
      .filter(meta =>
        // Frontend API calls that reference this route
        meta.entity.includes(change.entity) ||
        // Models that reference this DTO
        meta.entity === change.entity
      )
      .map(meta => meta.service)
      .filter((v, i, arr) => arr.indexOf(v) === i) // unique

    if (consumers.length > 0) {
      change.affectedConsumers = consumers
    }
  }

  return changes
}
```

---

## Example Output

For a PR that removes `employmentStatus` from `LoanApplicationDto` and removes a route:

```json
[
  {
    "type": "route-removed",
    "entity": "GET /loan/employment-status/:id",
    "details": "Route GET /loan/employment-status/:id has been removed. Any clients calling this endpoint will receive 404 errors.",
    "severity": "critical",
    "affectedConsumers": ["web-checkout"]
  },
  {
    "type": "field-removed",
    "entity": "LoanApplicationDto",
    "field": "employmentStatus",
    "details": "Field LoanApplicationDto.employmentStatus (was: EmploymentStatus) has been removed.",
    "severity": "critical",
    "affectedConsumers": ["web-checkout"]
  },
  {
    "type": "required-field-added",
    "entity": "LoanApplicationDto",
    "field": "creditScore",
    "details": "Required field LoanApplicationDto.creditScore (number) added. Existing clients not sending this field will fail validation.",
    "severity": "warning"
  }
]
```

---

## How This Integrates

```
Extractor output (StructuredChangeSet)
         |
         v
detectBreakingChanges()         <-- This phase (deterministic)
         |
         v
BreakingChange[]
         |
         +----> Claude prompt (Phase 5)       <-- LLM explains impact
         |       generates human-readable HTML
         |
         +----> Source PR comment (Phase 6)    <-- Warning badges
         |
         +----> Docs PR title (Phase 6)       <-- [BREAKING] prefix
```

The rule engine detects. Claude explains. The rules are the source of truth.

---

## Acceptance Criteria

- [ ] All 6 breaking change rules implemented
- [ ] Rules produce correct `BreakingChange[]` for test fixtures
- [ ] Breaking changes sorted by severity (critical first)
- [ ] Consumer enrichment works with existing metadata files
- [ ] Zero false negatives for the defined rule set
- [ ] Unit tests cover every rule with positive and negative cases
- [ ] Integration with Phase 5 (Claude) and Phase 6 (PR bot)
