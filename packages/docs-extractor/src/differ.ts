import type {
  ExtractionSnapshot,
  StructuredChangeSet,
  RouteChange,
  ModelChange,
  FieldChange,
  EventChange,
  TableChange,
  ColumnChange,
  ColumnModification,
  FrontendApiCall,
} from "./types.js"

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
  },
): StructuredChangeSet {
  return {
    ...meta,
    api: diffRoutes(base.routes, head.routes),
    models: diffModels(base.models, head.models),
    events: diffEvents(base.events, head.events),
    schema: diffTables(base.tables, head.tables),
    frontendApiCalls:
      base.apiCalls || head.apiCalls
        ? diffApiCalls(base.apiCalls ?? [], head.apiCalls ?? [])
        : undefined,
  }
}

// ---------------------------------------------------------------------------
// Route diffing
// ---------------------------------------------------------------------------

function routeKey(r: RouteChange): string {
  return `${r.method} ${r.path}`
}

function routeChanged(a: RouteChange, b: RouteChange): boolean {
  return a.requestDto !== b.requestDto || a.responseDto !== b.responseDto
}

function diffRoutes(
  base: RouteChange[],
  head: RouteChange[],
): { added: RouteChange[]; updated: RouteChange[]; removed: RouteChange[] } {
  const baseMap = new Map(base.map((r) => [routeKey(r), r]))
  const headMap = new Map(head.map((r) => [routeKey(r), r]))

  const added = head.filter((r) => !baseMap.has(routeKey(r)))
  const removed = base.filter((r) => !headMap.has(routeKey(r)))
  const updated = head.filter((r) => {
    const baseRoute = baseMap.get(routeKey(r))
    if (!baseRoute) return false
    return routeChanged(baseRoute, r)
  })

  return { added, updated, removed }
}

// ---------------------------------------------------------------------------
// Model diffing (with field-level detail)
// ---------------------------------------------------------------------------

function diffModels(
  base: ModelChange[],
  head: ModelChange[],
): { added: ModelChange[]; updated: ModelChange[]; removed: ModelChange[] } {
  const baseMap = new Map(base.map((m) => [m.name, m]))
  const headMap = new Map(head.map((m) => [m.name, m]))

  const added = head.filter((m) => !baseMap.has(m.name))
  const removed = base.filter((m) => !headMap.has(m.name))

  const updated: ModelChange[] = []
  for (const [name, headModel] of headMap) {
    const baseModel = baseMap.get(name)
    if (!baseModel) continue

    const baseFields = new Map(baseModel.fields.map((f) => [f.name, f]))
    const headFields = new Map(headModel.fields.map((f) => [f.name, f]))

    // Check for new or changed fields in head
    const changedFields: FieldChange[] = []
    for (const field of headModel.fields) {
      const baseField = baseFields.get(field.name)
      if (!baseField) {
        // New field
        changedFields.push(field)
      } else if (
        field.type !== baseField.type ||
        field.optional !== baseField.optional
      ) {
        // Modified field — record previous values
        changedFields.push({
          ...field,
          previousType: baseField.type,
          previousOptional: baseField.optional,
        })
      }
      // If field unchanged, skip (field reorder is not a change)
    }

    // Check for removed fields (in base but not in head)
    // Mark removed fields with previousType/previousOptional so the
    // breaking-change detector can distinguish them from new fields.
    const removedFields: FieldChange[] = baseModel.fields
      .filter((f) => !headFields.has(f.name))
      .map((f) => ({
        name: f.name,
        type: "",
        optional: f.optional,
        previousType: f.type,
        previousOptional: f.optional,
      }))

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

// ---------------------------------------------------------------------------
// Event diffing
// ---------------------------------------------------------------------------

function diffEvents(
  base: EventChange[],
  head: EventChange[],
): { added: EventChange[]; updated: EventChange[]; removed: EventChange[] } {
  const baseMap = new Map(base.map((e) => [e.name, e]))
  const headMap = new Map(head.map((e) => [e.name, e]))

  const added = head.filter((e) => !baseMap.has(e.name))
  const removed = base.filter((e) => !headMap.has(e.name))
  const updated = head.filter((e) => {
    const baseEvent = baseMap.get(e.name)
    if (!baseEvent) return false
    return (
      e.payload !== baseEvent.payload || e.channel !== baseEvent.channel
    )
  })

  return { added, updated, removed }
}

// ---------------------------------------------------------------------------
// Table / schema diffing
// ---------------------------------------------------------------------------

function diffTables(
  base: TableChange[],
  head: TableChange[],
): { added: TableChange[]; updated: TableChange[]; removed: TableChange[] } {
  const baseMap = new Map(base.map((t) => [t.table, t]))
  const headMap = new Map(head.map((t) => [t.table, t]))

  // Tables entirely new in head
  const added = head.filter((t) => !baseMap.has(t.table))

  // Tables removed from head
  const removed = base.filter((t) => !headMap.has(t.table))

  // Tables in both — compute column-level diff
  const updated: TableChange[] = []
  for (const [table, headTable] of headMap) {
    const baseTable = baseMap.get(table)
    if (!baseTable) continue

    // Flatten columns from both sides into maps by name
    const baseCols = new Map<string, string>()
    for (const col of baseTable.columns.added) baseCols.set(col.name, col.type)
    // In a snapshot, "added" means "columns that exist". The snapshot
    // columns represent the current state; base.columns.added = all columns
    // that exist on that table at that point in time.

    const headCols = new Map<string, string>()
    for (const col of headTable.columns.added) headCols.set(col.name, col.type)

    const addedCols: ColumnChange[] = []
    const removedCols: ColumnChange[] = []
    const modifiedCols: ColumnModification[] = []

    // Columns in head but not in base
    for (const [name, type] of headCols) {
      if (!baseCols.has(name)) {
        addedCols.push({ name, type })
      } else if (baseCols.get(name) !== type) {
        modifiedCols.push({ name, from: baseCols.get(name)!, to: type })
      }
    }

    // Columns in base but not in head
    for (const [name, type] of baseCols) {
      if (!headCols.has(name)) {
        removedCols.push({ name, type })
      }
    }

    if (addedCols.length > 0 || removedCols.length > 0 || modifiedCols.length > 0) {
      updated.push({
        table,
        columns: {
          added: addedCols,
          removed: removedCols,
          modified: modifiedCols,
        },
      })
    }
  }

  return { added, updated, removed }
}

// ---------------------------------------------------------------------------
// Frontend API call diffing
// ---------------------------------------------------------------------------

function apiCallKey(c: FrontendApiCall): string {
  return `${c.method} ${c.url}`
}

function diffApiCalls(
  base: FrontendApiCall[],
  head: FrontendApiCall[],
): { added: FrontendApiCall[]; removed: FrontendApiCall[]; updated: FrontendApiCall[] } {
  const baseMap = new Map(base.map((c) => [apiCallKey(c), c]))
  const headMap = new Map(head.map((c) => [apiCallKey(c), c]))

  const added = head.filter((c) => !baseMap.has(apiCallKey(c)))
  const removed = base.filter((c) => !headMap.has(apiCallKey(c)))
  const updated = head.filter((c) => {
    const baseCall = baseMap.get(apiCallKey(c))
    if (!baseCall) return false
    return (
      c.requestDto !== baseCall.requestDto ||
      c.responseDto !== baseCall.responseDto ||
      c.callerFunction !== baseCall.callerFunction ||
      c.errorHandling !== baseCall.errorHandling
    )
  })

  return { added, removed, updated }
}
