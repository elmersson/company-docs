import { extractExpressRoutes } from "./extractors/express-routes.js"
import { extractDtoModels } from "./extractors/dto-models.js"
import { extractEvents } from "./extractors/events.js"
import { extractPrismaSchema } from "./extractors/prisma-schema.js"
import { extractFrontendApiCalls } from "./extractors/frontend-api-calls.js"
import { diffExtractions } from "./differ.js"
import { detectBreakingChanges } from "./breaking-changes.js"
import type {
  ExtractionSnapshot,
  StructuredChangeSet,
  BreakingChange,
} from "./types.js"

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type ExtractorConfig = {
  type: "backend" | "frontend"
  framework: "express" | "react"
  entryPoints?: string[]
  dtoPatterns?: string[]
  eventPatterns?: string[]
  prismaSchema?: string
  apiCallPatterns?: string[]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a full snapshot from a project directory.
 */
export function extract(
  projectPath: string,
  config: ExtractorConfig,
): ExtractionSnapshot {
  const routes =
    config.type === "backend" && config.entryPoints
      ? extractExpressRoutes(projectPath, config.entryPoints)
      : []

  const models = config.dtoPatterns
    ? extractDtoModels(projectPath, config.dtoPatterns)
    : []

  const events =
    config.type === "backend" && config.eventPatterns
      ? extractEvents(projectPath, config.eventPatterns)
      : []

  const tables = config.prismaSchema
    ? extractPrismaSchema(`${projectPath}/${config.prismaSchema}`)
    : []

  const apiCalls =
    config.type === "frontend" && config.apiCallPatterns
      ? extractFrontendApiCalls(projectPath, config.apiCallPatterns)
      : undefined

  return { routes, models, events, tables, apiCalls }
}

/**
 * Full pipeline: extract base + head, diff, and detect breaking changes.
 */
export function extractAndDiff(
  basePath: string,
  headPath: string,
  config: ExtractorConfig,
  meta: {
    service: string
    sourceRepo: string
    prNumber: number
    baseBranch: string
    headBranch: string
    headSha: string
  },
): {
  changeSet: StructuredChangeSet
  breakingChanges: BreakingChange[]
} {
  const baseSnapshot = extract(basePath, config)
  const headSnapshot = extract(headPath, config)
  const changeSet = diffExtractions(baseSnapshot, headSnapshot, meta)
  const breakingChanges = detectBreakingChanges(changeSet)

  return { changeSet, breakingChanges }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { diffExtractions } from "./differ.js"
export { detectBreakingChanges, enrichWithConsumers } from "./breaking-changes.js"
export { extractExpressRoutes } from "./extractors/express-routes.js"
export { extractDtoModels } from "./extractors/dto-models.js"
export { extractEvents } from "./extractors/events.js"
export { extractPrismaSchema } from "./extractors/prisma-schema.js"
export { extractFrontendApiCalls } from "./extractors/frontend-api-calls.js"

export type { ExtractionSnapshot } from "./types.js"
export type {
  RouteChange,
  FieldChange,
  ModelChange,
  EventChange,
  ColumnChange,
  ColumnModification,
  TableChange,
  FrontendApiCall,
  StructuredChangeSet,
  BreakingChange,
  BreakingChangeReport,
  DocFragment,
} from "./types.js"
