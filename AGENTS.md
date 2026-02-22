# AGENTS.md

This file provides guidance for AI coding agents operating in this repository.

## Project Overview

Automated documentation system that generates living docs from PRs across company repos.
Pipeline: PR opened -> GitHub Action extracts changes via ts-morph -> Claude generates HTML -> docs PR created -> auto-merged -> Astro site rebuilds.

Monorepo managed with **pnpm v9** (`pnpm-workspace.yaml` covers `packages/*`).

## Build / Lint / Test Commands

Package manager is **pnpm**. All commands run from the repo root.

```bash
# Build the extractor package
pnpm --filter @company/docs-extractor build

# Run all tests
pnpm --filter @company/docs-extractor test

# Run a single test file
pnpm --filter @company/docs-extractor test -- tests/express-routes.test.ts

# Run tests matching a name pattern
pnpm --filter @company/docs-extractor test -- -t "detects POST route"

# Watch mode
pnpm --filter @company/docs-extractor test:watch

# Coverage (thresholds: 80% branches, functions, lines)
pnpm --filter @company/docs-extractor test:coverage
```

There is **no ESLint or Prettier** configured. Style is maintained by convention (see below).

## TypeScript Configuration

- **Target / Module:** ES2022
- **`strict: true`** everywhere
- **`verbatimModuleSyntax: true`** -- you MUST use `import type { ... }` for type-only imports
- **ESM only** (`"type": "module"` in package.json) -- use `.js` extensions in all import paths
- **`moduleResolution: "bundler"`**
- GitHub Action scripts run via `npx tsx` (no compilation; `noEmit: true`)

## Code Style

### Formatting

- 2-space indentation
- **No semicolons**
- Double quotes for strings
- Trailing commas in multiline constructs
- Blank line between major sections

### Imports

```typescript
// .js extension required on all relative imports (ESM)
import { extractExpressRoutes } from "./extractors/express-routes.js"

// Type-only imports MUST use `import type` (verbatimModuleSyntax)
import type { RouteChange, StructuredChangeSet } from "./types.js"

// Node built-ins imported directly
import { readFileSync, existsSync } from "fs"
import { join } from "path"

// Re-exports in barrel files
export { diffExtractions } from "./differ.js"
export type { ExtractionSnapshot } from "./types.js"
```

### Naming Conventions

| Element          | Convention           | Example                          |
|------------------|----------------------|----------------------------------|
| Files            | kebab-case           | `express-routes.ts`, `loan.dto.ts` |
| Types            | PascalCase           | `RouteChange`, `StructuredChangeSet` |
| Functions        | camelCase            | `extractExpressRoutes`, `diffExtractions` |
| Constants/Enums  | SCREAMING_SNAKE_CASE | `HTTP_METHODS`                   |
| Variables        | camelCase            | `projectPath`, `baseSnapshot`    |
| Test fixtures    | kebab-case dirs      | `fixtures/express-app/`          |

- Private/fallible helpers use `try` prefix returning `null` on failure: `tryParseRouteCall`, `tryParseFetchCall`

### Types

- Prefer `export type { ... }` over `export interface` for data contracts
- JSDoc comments on public types and functions; skip on private helpers
- Use union string literal types for enums: `"GET" | "POST" | "PUT" | "PATCH" | "DELETE"`
- Types live in `contracts/` (canonical) and are mirrored in `packages/docs-extractor/src/types.ts`

### Section Headers

Use section comment banners to organize source files:

```typescript
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
```

### Error Handling

- Extractors return empty arrays when files don't exist -- no exceptions
- Use `existsSync()` before `readFileSync()` for optional files (e.g., Prisma schema)
- No try/catch in extractor code; errors propagate
- CI scripts use `process.exit(0)` for early exit when no changes detected
- Non-null assertions (`!`) used sparingly, only in tests on known-good fixture data

## Testing

**Framework:** Vitest v3+ with `globals: true`

Tests live in `packages/docs-extractor/tests/` alongside a `fixtures/` directory.

### Test Patterns

- Fixture-based: real TypeScript source files parsed via ts-morph (no mocking)
- `describe`/`it`/`expect` from vitest globals
- ESM `__dirname` pattern at the top of every test file:

```typescript
import { describe, it, expect } from "vitest"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURE_PATH = join(__dirname, "fixtures/express-app")
```

- Both positive and negative test cases (e.g., "returns empty array for files with no routes")
- Non-null assertions on fixture results: `expect(postRoute!.middleware).toContain("auth")`

## Architecture

- **Snapshot diffing:** extract BASE snapshot, extract HEAD snapshot, diff them
- **StructuredChangeSet** is the single contract between extraction and doc generation -- Claude never sees raw git diffs
- **Breaking change detection** is deterministic (rule-based, no LLM)
- **ts-morph projects** created with `skipAddingFilesFromTsConfig: true` and `skipFileDependencyResolution: true` for speed
- Source file paths in extractor output are always relative to the project root
- Diff keys: `"METHOD PATH"` for routes, `name` for models/events/tables, `"METHOD URL"` for API calls

## Git Conventions

- Branch names by phase: `phase-0`, `phase-1`, ..., `phase-N`
- Commit messages: `feat: implement Phase N <description>`
- PRs merged via GitHub merge commits

## Key Directories

```
contracts/                     # Canonical TypeScript type contracts
packages/docs-extractor/       # @company/docs-extractor (core package)
  src/extractors/              # 5 ts-morph extractors
  src/differ.ts                # Snapshot diffing
  tests/                       # Vitest tests + fixtures
.github/actions/docs-sync/     # Composite GitHub Action (4 scripts)
.github/workflows/             # Workflow templates (.yml.template)
.opencode/skills/              # 7 OpenCode agent skill files
docs/                          # Phase design documents (phases 0-9)
registry.json                  # Connected repos config
```
