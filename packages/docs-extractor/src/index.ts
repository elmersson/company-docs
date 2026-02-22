export type { ExtractionSnapshot } from "./types.js"
export { diffExtractions } from "./differ.js"

// Re-export contract types for convenience
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
