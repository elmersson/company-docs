---
name: github-action
description: Guide for building the reusable composite GitHub Action and workflows that power the docs-sync pipeline, auto-merge, and site deployment.
---

## What I do

Help build and debug the GitHub Actions infrastructure:

1. The reusable composite action in `.github/actions/docs-sync/`
2. The auto-merge workflow in `.github/workflows/auto-merge-docs.yml`
3. The site build/deploy workflow in `.github/workflows/build-site.yml`
4. The source repo workflow templates developers copy into their repos

## Composite action

Located at `.github/actions/docs-sync/action.yml`. Source repos reference it as:

```yaml
uses: your-org/company-docs/.github/actions/docs-sync@main
```

### Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `service-name` | yes | | Service identifier (e.g. "loan-api") |
| `repo-type` | yes | "backend" | "backend" or "frontend" |
| `framework` | yes | "express" | "express" or "react" |
| `entry-points` | no | `["src/routes/**/*.ts"]` | Route file globs (JSON array) |
| `dto-patterns` | no | `["src/dto/**/*.ts"]` | DTO file globs (JSON array) |
| `event-patterns` | no | `["src/events/**/*.ts"]` | Event file globs (JSON array) |
| `api-call-patterns` | no | `["src/api/**/*.ts"]` | Frontend API call globs (JSON array) |
| `prisma-schema-path` | no | "" | Path to schema.prisma |
| `anthropic-api-key` | yes | | Anthropic API key |
| `docs-repo-token` | yes | | PAT with write access to company-docs |
| `docs-repo` | no | "your-org/company-docs" | Docs repo in org/name format |

### Step sequence

```yaml
runs:
  using: "composite"
  steps:
    - Setup Node.js 20 + pnpm 9
    - Copy HEAD source to /tmp/docs-sync/head/
    - Checkout BASE branch to /tmp/docs-sync/base/
    - Checkout company-docs to /tmp/docs-sync/company-docs/
    - Install extractor: pnpm install --filter @company/docs-extractor
    - Run extract.ts (produces changeset.json + breaking-changes.json)
    - Run generate.ts (calls Claude, produces fragments.json)
    - Run create-pr.ts (writes HTML, creates PR in company-docs)
    - Run comment.ts (posts summary on source PR)
```

### Scripts

All scripts live in `.github/actions/docs-sync/scripts/` and are run with `npx tsx`:

- `extract.ts` — Runs extractor on base + head, produces StructuredChangeSet
- `generate.ts` — Calls Claude API, produces DocFragment[]
- `create-pr.ts` — Writes HTML files, creates/updates PR in company-docs
- `comment.ts` — Posts/updates comment on source PR with docs link + breaking changes

### Empty changeset handling

If extraction finds no changes (no routes, DTOs, events, or API calls modified), the action exits early with code 0. No docs PR is created.

## Auto-merge workflow

`.github/workflows/auto-merge-docs.yml` listens for `repository_dispatch` events:

- `source-pr-merged` — Find matching docs PR by branch name `docs/{service}/pr-{n}`, squash merge it
- `source-pr-closed` — Find matching docs PR, close it and delete the branch

Uses `gh pr merge --squash --delete-branch --admin` for the merge.

## Site build workflow

`.github/workflows/build-site.yml` triggers on push to `main` when `services/**` or `site/**` change:

1. Install pnpm dependencies
2. Build Astro site (`pnpm build` in site/)
3. Upload to GitHub Pages via `actions/upload-pages-artifact` + `actions/deploy-pages`

## Source repo workflows

Developers add two files to their repos:

1. `.github/workflows/docs-sync.yml` — triggers on `pull_request: [opened, synchronize]`
2. `.github/workflows/docs-merge-notify.yml` — triggers on `pull_request: [closed]`, sends `repository_dispatch`

## Key rules

- Source repos must checkout with `fetch-depth: 0` (full history for base comparison)
- The composite action uses `/tmp/docs-sync/` as its working directory
- Force-push to docs branch on PR updates (idempotent)
- Always update existing docs PR and comment, never create duplicates
- The `DOCS_REPO_TOKEN` must be a fine-grained PAT scoped to company-docs only
- Action should complete in under 2 minutes

## When to use me

Use this skill when building or debugging the composite action, any of the GitHub workflows, or the source repo workflow templates. Also useful when troubleshooting CI failures or token permission issues.
