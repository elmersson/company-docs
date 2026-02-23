/**
 * extract.ts — Phase 4 script
 *
 * Runs the extractor on BASE and HEAD branches, diffs them,
 * and writes the StructuredChangeSet to /tmp/docs-sync/changeset.json.
 *
 * Exits with code 0 (skipping later steps) if no extractable changes found.
 */

import { extractAndDiff } from "../../../../packages/docs-extractor/src/index.js"
import type { ExtractorConfig } from "../../../../packages/docs-extractor/src/index.js"
import { writeFileSync } from "fs"
import { join } from "path"

const SYNC_DIR = process.env.SYNC_DIR ?? "/tmp/docs-sync"

// ---------------------------------------------------------------------------
// Build extractor config from environment variables
// ---------------------------------------------------------------------------

const config: ExtractorConfig = {
  type: (process.env.REPO_TYPE ?? "backend") as "backend" | "frontend",
  framework: (process.env.FRAMEWORK ?? "express") as "express" | "react",
  entryPoints: JSON.parse(process.env.ENTRY_POINTS ?? '["src/routes/**/*.ts"]'),
  dtoPatterns: JSON.parse(process.env.DTO_PATTERNS ?? '["src/dto/**/*.ts"]'),
  eventPatterns: JSON.parse(process.env.EVENT_PATTERNS ?? '["src/events/**/*.ts"]'),
  apiCallPatterns: JSON.parse(process.env.API_CALL_PATTERNS ?? '["src/api/**/*.ts"]'),
  prismaSchema: process.env.PRISMA_SCHEMA || undefined,
}

const meta = {
  service: process.env.SERVICE_NAME!,
  sourceRepo: process.env.SOURCE_REPO!,
  prNumber: parseInt(process.env.PR_NUMBER!, 10),
  baseBranch: process.env.BASE_BRANCH!,
  headBranch: process.env.HEAD_BRANCH!,
  headSha: process.env.HEAD_SHA!,
}

// ---------------------------------------------------------------------------
// Run extraction + diff
// ---------------------------------------------------------------------------

console.log(`Extracting changes for ${meta.service} (${config.type}/${config.framework})`)
console.log(`  BASE: ${process.env.BASE_PATH}`)
console.log(`  HEAD: ${process.env.HEAD_PATH}`)

const { changeSet, breakingChanges } = extractAndDiff(
  process.env.BASE_PATH!,
  process.env.HEAD_PATH!,
  config,
  meta,
)

// ---------------------------------------------------------------------------
// Check for empty changeset
// ---------------------------------------------------------------------------

const isEmpty =
  changeSet.api.added.length === 0 &&
  changeSet.api.updated.length === 0 &&
  changeSet.api.removed.length === 0 &&
  changeSet.models.added.length === 0 &&
  changeSet.models.updated.length === 0 &&
  changeSet.models.removed.length === 0 &&
  changeSet.events.added.length === 0 &&
  changeSet.events.updated.length === 0 &&
  changeSet.events.removed.length === 0 &&
  changeSet.schema.added.length === 0 &&
  changeSet.schema.updated.length === 0 &&
  changeSet.schema.removed.length === 0

if (isEmpty) {
  console.log("No extractable changes found. Skipping documentation generation.")
  // Write empty files so downstream steps don't fail on missing files
  writeFileSync(join(SYNC_DIR, "changeset.json"), JSON.stringify(changeSet, null, 2))
  writeFileSync(join(SYNC_DIR, "breaking-changes.json"), JSON.stringify([], null, 2))
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

writeFileSync(join(SYNC_DIR, "changeset.json"), JSON.stringify(changeSet, null, 2))

writeFileSync(join(SYNC_DIR, "breaking-changes.json"), JSON.stringify(breakingChanges, null, 2))

console.log(`Extraction complete:`)
console.log(`  API: +${changeSet.api.added.length} ~${changeSet.api.updated.length} -${changeSet.api.removed.length}`)
console.log(`  Models: +${changeSet.models.added.length} ~${changeSet.models.updated.length} -${changeSet.models.removed.length}`)
console.log(`  Events: +${changeSet.events.added.length} ~${changeSet.events.updated.length} -${changeSet.events.removed.length}`)
console.log(`  Schema: +${changeSet.schema.added.length} ~${changeSet.schema.updated.length} -${changeSet.schema.removed.length}`)
if (changeSet.frontendApiCalls) {
  console.log(`  API Calls: +${changeSet.frontendApiCalls.added.length} ~${changeSet.frontendApiCalls.updated.length} -${changeSet.frontendApiCalls.removed.length}`)
}
