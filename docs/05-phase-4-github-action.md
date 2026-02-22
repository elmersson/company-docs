# Phase 4 - GitHub Action in Source Repositories

**Duration:** 3-4 days
**Dependencies:** Phase 3 (extractor package built)
**Outcome:** Reusable composite action that source repos use to trigger documentation generation

---

## Objective

Create a reusable GitHub composite action hosted in `company-docs` that any source repository can reference. When a PR is created or updated in a source repo, this action:

1. Checks out base and head branches
2. Runs the extractor on both
3. Produces a `StructuredChangeSet`
4. Passes it to Claude for doc generation (Phase 5)
5. Creates a PR in `company-docs` (Phase 6)

---

## Action Definition

### `.github/actions/docs-sync/action.yml`

```yaml
name: "Documentation Sync"
description: "Extract code changes and generate documentation via Claude"

inputs:
  service-name:
    description: "Name of the service (e.g. loan-api)"
    required: true
  repo-type:
    description: "backend or frontend"
    required: true
    default: "backend"
  framework:
    description: "express or react"
    required: true
    default: "express"
  entry-points:
    description: "Glob patterns for route files (JSON array)"
    required: false
    default: '["src/routes/**/*.ts"]'
  dto-patterns:
    description: "Glob patterns for DTO/model files (JSON array)"
    required: false
    default: '["src/dto/**/*.ts", "src/models/**/*.ts"]'
  event-patterns:
    description: "Glob patterns for event files (JSON array)"
    required: false
    default: '["src/events/**/*.ts"]'
  api-call-patterns:
    description: "Glob patterns for frontend API call files (JSON array)"
    required: false
    default: '["src/api/**/*.ts", "src/services/**/*.ts"]'
  prisma-schema-path:
    description: "Path to prisma schema file (relative to repo root)"
    required: false
    default: ""
  anthropic-api-key:
    description: "Anthropic API key for Claude"
    required: true
  docs-repo-token:
    description: "GitHub PAT with write access to company-docs"
    required: true
  docs-repo:
    description: "Documentation repository (org/repo format)"
    required: false
    default: "your-org/company-docs"

runs:
  using: "composite"
  steps:
    # Step 1: Setup Node.js
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: "20"

    # Step 2: Setup pnpm
    - name: Setup pnpm
      uses: pnpm/action-setup@v4
      with:
        version: 9

    # Step 3: Checkout source repo at HEAD (already done by caller)
    - name: Copy HEAD source
      shell: bash
      run: |
        mkdir -p /tmp/docs-sync/head
        cp -r . /tmp/docs-sync/head/

    # Step 4: Checkout source repo at BASE
    - name: Checkout BASE branch
      uses: actions/checkout@v4
      with:
        ref: ${{ github.event.pull_request.base.sha }}
        path: /tmp/docs-sync/base

    # Step 5: Checkout company-docs (for extractor + prompts)
    - name: Checkout company-docs
      uses: actions/checkout@v4
      with:
        repository: ${{ inputs.docs-repo }}
        token: ${{ inputs.docs-repo-token }}
        path: /tmp/docs-sync/company-docs

    # Step 6: Install extractor dependencies
    - name: Install extractor
      shell: bash
      working-directory: /tmp/docs-sync/company-docs
      run: pnpm install --filter @company/docs-extractor

    # Step 7: Run extraction + diff
    - name: Extract and diff
      shell: bash
      working-directory: /tmp/docs-sync/company-docs
      env:
        SERVICE_NAME: ${{ inputs.service-name }}
        REPO_TYPE: ${{ inputs.repo-type }}
        FRAMEWORK: ${{ inputs.framework }}
        ENTRY_POINTS: ${{ inputs.entry-points }}
        DTO_PATTERNS: ${{ inputs.dto-patterns }}
        EVENT_PATTERNS: ${{ inputs.event-patterns }}
        API_CALL_PATTERNS: ${{ inputs.api-call-patterns }}
        PRISMA_SCHEMA: ${{ inputs.prisma-schema-path }}
        BASE_PATH: /tmp/docs-sync/base
        HEAD_PATH: /tmp/docs-sync/head
        SOURCE_REPO: ${{ github.repository }}
        PR_NUMBER: ${{ github.event.pull_request.number }}
        BASE_BRANCH: ${{ github.event.pull_request.base.ref }}
        HEAD_BRANCH: ${{ github.event.pull_request.head.ref }}
        HEAD_SHA: ${{ github.event.pull_request.head.sha }}
      run: |
        npx tsx .github/actions/docs-sync/scripts/extract.ts

    # Step 8: Generate docs with Claude
    - name: Generate documentation
      shell: bash
      working-directory: /tmp/docs-sync/company-docs
      env:
        ANTHROPIC_API_KEY: ${{ inputs.anthropic-api-key }}
        CHANGESET_PATH: /tmp/docs-sync/changeset.json
        BREAKING_CHANGES_PATH: /tmp/docs-sync/breaking-changes.json
        SERVICE_NAME: ${{ inputs.service-name }}
      run: |
        npx tsx .github/actions/docs-sync/scripts/generate.ts

    # Step 9: Create PR in company-docs
    - name: Create docs PR
      shell: bash
      working-directory: /tmp/docs-sync/company-docs
      env:
        GITHUB_TOKEN: ${{ inputs.docs-repo-token }}
        DOCS_REPO: ${{ inputs.docs-repo }}
        SERVICE_NAME: ${{ inputs.service-name }}
        PR_NUMBER: ${{ github.event.pull_request.number }}
        SOURCE_REPO: ${{ github.repository }}
        SOURCE_PR_URL: ${{ github.event.pull_request.html_url }}
        FRAGMENTS_PATH: /tmp/docs-sync/fragments.json
      run: |
        npx tsx .github/actions/docs-sync/scripts/create-pr.ts

    # Step 10: Post comment on source PR
    - name: Comment on source PR
      shell: bash
      env:
        GITHUB_TOKEN: ${{ github.token }}
        PR_NUMBER: ${{ github.event.pull_request.number }}
        DOCS_PR_URL: ${{ env.DOCS_PR_URL }}
        BREAKING_CHANGES_PATH: /tmp/docs-sync/breaking-changes.json
      run: |
        npx tsx .github/actions/docs-sync/scripts/comment.ts
```

---

## Action Scripts

### `scripts/extract.ts`

```typescript
import { extractAndDiff, type ExtractorConfig } from "@company/docs-extractor"
import { writeFileSync } from "fs"

const config: ExtractorConfig = {
  type: process.env.REPO_TYPE as "backend" | "frontend",
  framework: process.env.FRAMEWORK as "express" | "react",
  entryPoints: JSON.parse(process.env.ENTRY_POINTS ?? "[]"),
  dtoPatterns: JSON.parse(process.env.DTO_PATTERNS ?? "[]"),
  eventPatterns: JSON.parse(process.env.EVENT_PATTERNS ?? "[]"),
  apiCallPatterns: JSON.parse(process.env.API_CALL_PATTERNS ?? "[]"),
  prismaSchema: process.env.PRISMA_SCHEMA || undefined,
}

const { changeSet, breakingChanges } = extractAndDiff(
  process.env.BASE_PATH!,
  process.env.HEAD_PATH!,
  config,
  {
    service: process.env.SERVICE_NAME!,
    sourceRepo: process.env.SOURCE_REPO!,
    prNumber: parseInt(process.env.PR_NUMBER!, 10),
    baseBranch: process.env.BASE_BRANCH!,
    headBranch: process.env.HEAD_BRANCH!,
    headSha: process.env.HEAD_SHA!,
  }
)

// Check if changeset is empty (no extractable changes)
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
  process.exit(0)
}

writeFileSync("/tmp/docs-sync/changeset.json", JSON.stringify(changeSet, null, 2))
writeFileSync("/tmp/docs-sync/breaking-changes.json", JSON.stringify(breakingChanges, null, 2))

console.log(`Extracted ${changeSet.api.added.length} new routes, ${changeSet.models.updated.length} updated models`)
console.log(`Detected ${breakingChanges.length} breaking changes`)
```

---

## Source Repo Workflow

Each source repo adds this single file to enable documentation sync:

### `.github/workflows/docs-sync.yml` (in source repo)

```yaml
name: Documentation Sync
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  docs:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write  # To post comments on source PR
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: your-org/company-docs/.github/actions/docs-sync@main
        with:
          service-name: loan-api
          repo-type: backend
          framework: express
          entry-points: '["src/routes/**/*.ts"]'
          dto-patterns: '["src/dto/**/*.ts"]'
          event-patterns: '["src/events/**/*.ts"]'
          prisma-schema-path: "prisma/schema.prisma"
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          docs-repo-token: ${{ secrets.DOCS_REPO_TOKEN }}
```

### Frontend Example (web-checkout)

```yaml
name: Documentation Sync
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  docs:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: your-org/company-docs/.github/actions/docs-sync@main
        with:
          service-name: web-checkout
          repo-type: frontend
          framework: react
          api-call-patterns: '["src/api/**/*.ts", "src/services/**/*.ts"]'
          dto-patterns: '["src/types/**/*.ts"]'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          docs-repo-token: ${{ secrets.DOCS_REPO_TOKEN }}
```

---

## Performance Budget

| Step | Expected Duration |
|---|---|
| Checkout (base + head + company-docs) | ~30s |
| Install dependencies | ~20s |
| Run extractor (base) | ~5s |
| Run extractor (head) | ~5s |
| Diff + breaking changes | ~1s |
| Claude API call | ~15-30s |
| Create docs PR | ~5s |
| Post comment | ~2s |
| **Total** | **~90s** |

GitHub Actions timeout is 6 hours. This action should consistently complete in under 2 minutes.

---

## Acceptance Criteria

- [ ] Composite action defined in `.github/actions/docs-sync/action.yml`
- [ ] All 4 scripts implemented (`extract.ts`, `generate.ts`, `create-pr.ts`, `comment.ts`)
- [ ] Action works with both backend and frontend repo configurations
- [ ] Empty changesets skip doc generation (no empty PRs)
- [ ] Action completes in under 2 minutes for typical PRs
- [ ] Source PR receives a comment with docs PR link + breaking change warnings
