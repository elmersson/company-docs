/**
 * generate.ts — Phase 5 placeholder
 *
 * This script will call the Claude API with the StructuredChangeSet
 * and produce DocFragment[] (HTML documentation fragments).
 *
 * Full implementation comes in Phase 5 (claude-service).
 * For now, this reads the changeset and writes a placeholder fragments file.
 */

import { readFileSync, writeFileSync, existsSync } from "fs"

const changesetPath = process.env.CHANGESET_PATH ?? "/tmp/docs-sync/changeset.json"
const serviceName = process.env.SERVICE_NAME ?? "unknown"

// ---------------------------------------------------------------------------
// Read changeset
// ---------------------------------------------------------------------------

if (!existsSync(changesetPath)) {
  console.log("No changeset.json found — nothing to generate.")
  process.exit(0)
}

const changeset = JSON.parse(readFileSync(changesetPath, "utf-8"))

console.log(`Generating documentation for ${serviceName}...`)
console.log(`(Phase 5 placeholder — Claude API integration not yet implemented)`)

// ---------------------------------------------------------------------------
// Write placeholder fragments
// ---------------------------------------------------------------------------

// In Phase 5, this will call Claude and produce real HTML fragments.
// For now, write an empty fragments array so the pipeline can be tested end-to-end.

const fragments: unknown[] = []

writeFileSync("/tmp/docs-sync/fragments.json", JSON.stringify(fragments, null, 2))

console.log(`Wrote ${fragments.length} fragments to /tmp/docs-sync/fragments.json`)
console.log(`TODO: Implement Claude API call in Phase 5`)
