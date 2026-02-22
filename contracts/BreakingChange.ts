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
