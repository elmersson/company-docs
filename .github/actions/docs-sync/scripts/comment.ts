/**
 * comment.ts — Phase 6 placeholder
 *
 * This script will post or update a comment on the source PR with:
 * - Link to the docs PR in company-docs
 * - Summary of documentation changes
 * - Breaking change warnings (if any)
 *
 * Full implementation comes in Phase 6 (docs-pr-bot).
 * For now, this is a placeholder that logs what it would do.
 */

import { readFileSync, existsSync } from "fs"

const prNumber = process.env.PR_NUMBER ?? "0"
const docsPrUrl = process.env.DOCS_PR_URL ?? ""
const breakingChangesPath = process.env.BREAKING_CHANGES_PATH ?? "/tmp/docs-sync/breaking-changes.json"

// ---------------------------------------------------------------------------
// Read breaking changes
// ---------------------------------------------------------------------------

let breakingChanges: unknown[] = []
if (existsSync(breakingChangesPath)) {
  breakingChanges = JSON.parse(readFileSync(breakingChangesPath, "utf-8"))
}

// ---------------------------------------------------------------------------
// Placeholder: log what would happen
// ---------------------------------------------------------------------------

console.log(`Posting comment on source PR #${prNumber}`)
if (docsPrUrl) {
  console.log(`  Docs PR: ${docsPrUrl}`)
}
console.log(`  Breaking changes: ${breakingChanges.length}`)
console.log(`(Phase 6 placeholder — comment posting not yet implemented)`)

// In Phase 6, this will:
// 1. Build a markdown comment body with:
//    - Link to the docs PR
//    - Summary of what was documented
//    - Breaking change warnings with severity
// 2. Search for existing bot comment on the PR
// 3. Update the existing comment or create a new one via GitHub API
