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
