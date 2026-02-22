---
name: breaking-changes
description: Guide for the deterministic breaking change rule engine that detects backward-incompatible changes from StructuredChangeSet data without using an LLM.
---

## What I do

Help build and extend the breaking change detection rule engine in `packages/docs-extractor/src/breaking-changes.ts`. This is pure deterministic logic — no LLM. The rules analyze a `StructuredChangeSet` and output `BreakingChange[]`.

## Rules

| # | Type | Condition | Severity |
|---|---|---|---|
| 1 | `route-removed` | Route in base, absent in head | critical |
| 2 | `event-removed` | Event in base, absent in head | critical |
| 3 | `field-type-changed` | Same field, different type string | critical |
| 4 | `nullable-to-required` | `optional: true` -> `optional: false` | critical |
| 5 | `field-removed` | Field in base model, absent in head model | critical |
| 6 | `required-field-added` | New field with `optional: false` on existing model | warning |

## Implementation pattern

```typescript
import type { StructuredChangeSet } from "./types"

export type BreakingChange = {
  type: "field-removed" | "field-type-changed" | "route-removed" |
        "event-removed" | "nullable-to-required" | "required-field-added"
  entity: string
  field?: string
  details: string
  severity: "critical" | "warning"
  affectedConsumers?: string[]
}

export function detectBreakingChanges(changeSet: StructuredChangeSet): BreakingChange[] {
  const changes: BreakingChange[] = []

  // Check changeSet.api.removed -> route-removed
  // Check changeSet.events.removed -> event-removed
  // Check changeSet.models.updated fields for:
  //   - previousType !== type -> field-type-changed
  //   - previousOptional === true && optional === false -> nullable-to-required
  //   - no previousType && optional === false -> required-field-added
  // Check changeSet.models.removed -> field-removed (entire model)

  // Sort: critical first, then warning
  changes.sort((a, b) => a.severity === "critical" ? -1 : 1)
  return changes
}
```

## Consumer enrichment

After detecting breaking changes, cross-reference with existing docs metadata to find which repos are affected:

```typescript
// Read all _meta-*.json files from services/
// Find entries that reference the affected entity
// Add their service names to affectedConsumers[]
```

## How breaking changes flow through the system

```
detectBreakingChanges() -> BreakingChange[]
    |
    +-> Source PR comment (warning badges)
    +-> Docs PR title ([BREAKING] prefix)
    +-> Claude prompt (generates human-readable explanation)
    +-> Astro site (breaking badge on affected pages)
```

The rule engine detects. Claude explains. Rules are the source of truth.

## Testing

Every rule needs positive and negative test cases:

```typescript
it("detects removed route as critical", () => {
  const cs = makeChangeSet({ api: { removed: [{ method: "GET", path: "/test", ... }] } })
  const changes = detectBreakingChanges(cs)
  expect(changes[0].type).toBe("route-removed")
  expect(changes[0].severity).toBe("critical")
})

it("returns empty for safe changes", () => {
  const cs = makeChangeSet({ models: { added: [newModel] } })
  expect(detectBreakingChanges(cs)).toHaveLength(0)
})
```

## Key rules

- No LLM calls. This is deterministic.
- New optional fields are safe. New required fields on existing models are warnings.
- Entire model removal = critical (all fields gone).
- Always include `entity` and `details` in output for human readability.
- Sort critical before warning in output.

## When to use me

Use this skill when implementing, extending, or debugging the breaking change rule engine. Also useful when adding new rule types (e.g. response type changed, middleware removed).
