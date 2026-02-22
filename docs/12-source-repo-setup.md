# Source Repo Setup Guide

**This is the guide that developers follow to connect their repository to the automated documentation system.**

---

## Overview

Connecting your repository requires adding **two workflow files** and configuring **two secrets**. No other changes to your codebase are needed.

**Total setup time: ~10 minutes.**

---

## Prerequisites

Before starting:

1. Your repo uses **TypeScript**
2. Your repo uses **Express.js** (backend) or **React + fetch/axios** (frontend)
3. You have access to the org-level GitHub secrets, or your repo admin can add them
4. Your repo has **GitHub Actions enabled**

---

## Step 1: Configure Secrets

Add these secrets to your repository (Settings > Secrets and variables > Actions):

| Secret | Value | How to Get |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key | Contact platform team or check org secrets |
| `DOCS_REPO_TOKEN` | Fine-grained GitHub PAT | See instructions below |

### Creating the DOCS_REPO_TOKEN

If not already configured as an org-level secret:

1. Go to **GitHub Settings > Developer Settings > Fine-grained tokens**
2. Click **Generate new token**
3. Settings:
   - Token name: `docs-sync-bot-{your-repo-name}`
   - Expiration: 90 days (set a calendar reminder to rotate)
   - Repository access: **Only select repositories** > select `company-docs`
   - Permissions:
     - Contents: **Read and write**
     - Pull requests: **Read and write**
     - Metadata: **Read-only**
4. Click **Generate token** and save it as the `DOCS_REPO_TOKEN` secret

---

## Step 2: Add Documentation Sync Workflow

Create `.github/workflows/docs-sync.yml` in your repository:

### Backend (Express.js) Example

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
          fetch-depth: 0  # Full history needed for base branch comparison

      - uses: your-org/company-docs/.github/actions/docs-sync@main
        with:
          service-name: your-service-name    # e.g. "loan-api"
          repo-type: backend
          framework: express

          # Customize these patterns to match your project structure:
          entry-points: '["src/routes/**/*.ts"]'
          dto-patterns: '["src/dto/**/*.ts", "src/models/**/*.ts", "src/types/**/*.ts"]'
          event-patterns: '["src/events/**/*.ts"]'

          # Optional: only if you use Prisma
          prisma-schema-path: "prisma/schema.prisma"

          # Secrets
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          docs-repo-token: ${{ secrets.DOCS_REPO_TOKEN }}
```

### Frontend (React + fetch/axios) Example

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
          service-name: your-service-name    # e.g. "web-checkout"
          repo-type: frontend
          framework: react

          # Customize these patterns to match your project structure:
          api-call-patterns: '["src/api/**/*.ts", "src/services/**/*.ts", "src/hooks/**/*.ts"]'
          dto-patterns: '["src/types/**/*.ts", "src/models/**/*.ts"]'

          # Secrets
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          docs-repo-token: ${{ secrets.DOCS_REPO_TOKEN }}
```

---

## Step 3: Add Merge Notification Workflow

Create `.github/workflows/docs-merge-notify.yml`:

```yaml
name: Notify Docs on PR Merge/Close
on:
  pull_request:
    types: [closed]

jobs:
  # When PR is merged, trigger docs auto-merge
  notify-merged:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.DOCS_REPO_TOKEN }}
          repository: your-org/company-docs
          event-type: source-pr-merged
          client-payload: |
            {
              "service": "your-service-name",
              "prNumber": ${{ github.event.pull_request.number }},
              "sourceRepo": "${{ github.repository }}",
              "sourcePrUrl": "${{ github.event.pull_request.html_url }}",
              "mergedBy": "${{ github.event.pull_request.merged_by.login }}",
              "mergedAt": "${{ github.event.pull_request.merged_at }}"
            }

  # When PR is closed without merging, clean up docs PR
  notify-closed:
    if: github.event.pull_request.merged == false
    runs-on: ubuntu-latest
    steps:
      - uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.DOCS_REPO_TOKEN }}
          repository: your-org/company-docs
          event-type: source-pr-closed
          client-payload: |
            {
              "service": "your-service-name",
              "prNumber": ${{ github.event.pull_request.number }}
            }
```

**Important:** Replace `your-service-name` with the same value used in `docs-sync.yml`.

---

## Step 4: Register Your Service

Contact the platform team (or submit a PR) to add your service to `registry.json` in `company-docs`:

```json
{
  "name": "your-service-name",
  "repo": "your-org/your-repo",
  "type": "backend",
  "framework": "express",
  "entryPoints": ["src/routes/**/*.ts"],
  "dtoPatterns": ["src/dto/**/*.ts"],
  "eventPatterns": ["src/events/**/*.ts"],
  "prismaSchema": "prisma/schema.prisma"
}
```

---

## Step 5: Test It

1. Create a branch with a small change (add a new route, modify a DTO)
2. Open a PR
3. Wait ~90 seconds for the docs-sync action to complete
4. Check:
   - [ ] A comment appears on your PR with a link to the docs PR
   - [ ] The docs PR in `company-docs` contains generated HTML
   - [ ] Breaking changes (if any) are highlighted

---

## Customizing File Patterns

The glob patterns tell the extractor where to find your code. Common patterns:

### Backend Routes

```yaml
# Standard Express structure
entry-points: '["src/routes/**/*.ts"]'

# Controller-based structure
entry-points: '["src/controllers/**/*.ts"]'

# Single routes file
entry-points: '["src/app.ts"]'

# Multiple route directories
entry-points: '["src/routes/**/*.ts", "src/api/**/*.ts"]'
```

### DTOs / Models

```yaml
# Standard DTO directory
dto-patterns: '["src/dto/**/*.ts"]'

# Multiple locations
dto-patterns: '["src/dto/**/*.ts", "src/models/**/*.ts", "src/types/**/*.ts"]'

# Shared types package
dto-patterns: '["packages/shared-types/src/**/*.ts"]'
```

### Frontend API Calls

```yaml
# API service layer
api-call-patterns: '["src/api/**/*.ts"]'

# Service + hooks
api-call-patterns: '["src/api/**/*.ts", "src/services/**/*.ts", "src/hooks/use*Api*.ts"]'

# Everything in src (broad)
api-call-patterns: '["src/**/*.ts", "src/**/*.tsx"]'
```

---

## Troubleshooting

### Action fails with "No extractable changes found"

This means the extractor didn't find any routes, DTOs, events, or API calls in the changed files. Check:

- Are your file patterns correct? Run `ls src/routes/` to verify
- Does your code use standard Express patterns? (`router.get(...)`)
- Are your DTOs exported? (`export interface ...`)

### Action fails with "Failed to create PR"

- Verify `DOCS_REPO_TOKEN` has `contents: write` and `pull_requests: write` on `company-docs`
- Check if the token has expired

### Generated docs look wrong

The Claude-generated HTML may occasionally produce unexpected output. If this happens:

1. Check the `StructuredChangeSet` in the action logs
2. If the extraction is correct but the HTML is bad, the prompt may need tuning — open an issue in `company-docs`
3. If the extraction is wrong, the extractor may need to handle your code pattern — open an issue with a code sample

---

## FAQ

**Q: Does this run on every commit to the PR?**
A: Yes, on `opened` and `synchronize` events. The docs PR is updated (not duplicated) on each run.

**Q: What happens if I close my PR without merging?**
A: The docs PR is automatically closed and the branch deleted.

**Q: Does this cost money?**
A: Each run costs approximately $0.01-0.12 in Claude API usage. Monthly cost for a typical team: $5-15.

**Q: Can I opt out specific PRs?**
A: Add `[skip-docs]` to your PR title (configurable — requires extending the action).

**Q: What if the docs generation fails?**
A: The action failure does not block your PR. Documentation sync is non-blocking.
