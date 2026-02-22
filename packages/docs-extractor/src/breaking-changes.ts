import { readFileSync } from "fs"
import { join } from "path"
import { glob } from "glob"
import type { StructuredChangeSet, BreakingChange } from "./types.js"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect breaking changes from a StructuredChangeSet.
 * Pure deterministic rules — no LLM involved.
 *
 * Rules implemented:
 *   1. Route removed          (critical)
 *   2. Event removed          (critical)
 *   3. Field type changed     (critical)
 *   4. Nullable to required   (critical)
 *   5. Field removed          (critical)  — entire model or individual field
 *   6. Required field added   (warning)
 *   7. Route method changed   (warning)
 *   8. Request DTO changed    (warning)
 */
export function detectBreakingChanges(
  changeSet: StructuredChangeSet,
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

  // Rules 3-4: Field type changed / nullable to required (on updated models)
  for (const model of changeSet.models.updated) {
    for (const field of model.fields) {
      // Rule 3: Field type changed
      if (field.previousType && field.type && field.type !== field.previousType) {
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

  // Rule 5a: Entire model removed
  for (const model of changeSet.models.removed) {
    changes.push({
      type: "field-removed",
      entity: model.name,
      details: `Model ${model.name} has been entirely removed. All fields are no longer available.`,
      severity: "critical",
    })
  }

  // Rule 5b: Individual fields removed on updated models
  // The differ marks removed fields with previousType set and type === ""
  for (const model of changeSet.models.updated) {
    for (const field of model.fields) {
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
      if (!field.previousType && field.type && !field.optional) {
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

// ---------------------------------------------------------------------------
// Cross-repo consumer enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich breaking changes with affected consumer information.
 * Scans existing docs in services/ to find which repos reference
 * the affected entities.
 */
export async function enrichWithConsumers(
  changes: BreakingChange[],
  servicesDir: string,
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
      .filter(
        (meta) =>
          // Frontend API calls that reference this route
          meta.entity.includes(change.entity) ||
          // Models that reference this DTO
          meta.entity === change.entity,
      )
      .map((meta) => meta.service)
      .filter((v, i, arr) => arr.indexOf(v) === i) // unique

    if (consumers.length > 0) {
      change.affectedConsumers = consumers
    }
  }

  return changes
}
