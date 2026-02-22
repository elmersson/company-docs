# company-docs

Automated documentation system that generates and maintains living documentation across all company repositories. Zero manual writing.

## How It Works

```
Developer opens PR in any connected repo
        |
        v
GitHub Action extracts changes (routes, DTOs, events, schemas)
        |
        v
Claude generates HTML documentation from structured data
        |
        v
PR created in this repo with generated docs
        |
        v
Developer merges their PR --> docs PR auto-merges
        |
        v
Astro site rebuilds --> documentation is live
```

**No developer writes documentation. Docs always match production.**

## What Gets Documented

| Source | Detected By | Output |
|---|---|---|
| Express routes | `ts-morph` AST analysis | API endpoint docs |
| TypeScript interfaces/types | `ts-morph` AST analysis | Data model docs |
| Event publishers | `ts-morph` AST analysis | Domain event docs |
| Prisma schema changes | Schema parser | Database schema docs |
| Frontend fetch/axios calls | `ts-morph` AST analysis | API consumer docs |
| Cross-repo data flows | Matching FE calls to BE routes | Flow diagrams |
| Breaking changes | Deterministic rule engine | Breaking change reports |

## Repository Structure

```
company-docs/
├── .github/
│   ├── actions/docs-sync/          # Reusable composite action (used by source repos)
│   └── workflows/                  # Build site, auto-merge docs PRs
├── packages/
│   └── docs-extractor/             # @company/docs-extractor (ts-morph based)
├── contracts/                      # Shared TypeScript type contracts
├── prompts/                        # Claude prompt templates
├── site/                           # Astro documentation site
├── services/                       # Generated docs (auto-committed by bot)
│   └── {service-name}/
│       ├── api/                    # Endpoint documentation
│       ├── models/                 # DTO/interface documentation
│       ├── events/                 # Domain event documentation
│       ├── flows/                  # Cross-service flow documentation
│       └── breaking-changes/       # Breaking change reports
├── docs/                           # Project documentation (you are here)
├── registry.json                   # Connected repositories configuration
└── ROADMAP.md                      # Timeline and milestones
```

## Connecting Your Repository

Add **two workflow files** and **two secrets**. Total setup: ~10 minutes.

### 1. Add Secrets

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API access |
| `DOCS_REPO_TOKEN` | Fine-grained PAT scoped to this repo (contents + PRs) |

### 2. Add Docs Sync Workflow

**Backend (Express.js):**

```yaml
# .github/workflows/docs-sync.yml
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
          service-name: your-service-name
          repo-type: backend
          framework: express
          entry-points: '["src/routes/**/*.ts"]'
          dto-patterns: '["src/dto/**/*.ts", "src/models/**/*.ts"]'
          event-patterns: '["src/events/**/*.ts"]'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          docs-repo-token: ${{ secrets.DOCS_REPO_TOKEN }}
```

**Frontend (React):**

```yaml
# .github/workflows/docs-sync.yml
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
          service-name: your-service-name
          repo-type: frontend
          framework: react
          api-call-patterns: '["src/api/**/*.ts", "src/services/**/*.ts"]'
          dto-patterns: '["src/types/**/*.ts"]'
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          docs-repo-token: ${{ secrets.DOCS_REPO_TOKEN }}
```

### 3. Add Merge Notification Workflow

```yaml
# .github/workflows/docs-merge-notify.yml
name: Notify Docs on Merge
on:
  pull_request:
    types: [closed]

jobs:
  notify:
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
              "mergedBy": "${{ github.event.pull_request.merged_by.login }}"
            }
```

Full setup guide: [docs/12-source-repo-setup.md](docs/12-source-repo-setup.md)

## Breaking Change Detection

The system detects backward-incompatible changes using deterministic rules (no LLM):

| Change | Severity |
|---|---|
| DTO field removed | Critical |
| DTO field type changed | Critical |
| Route removed | Critical |
| Event removed | Critical |
| Optional field became required | Critical |
| Required field added to existing model | Warning |

When detected, breaking changes are:
- Flagged in the source PR comment
- Marked in the docs PR title with `[BREAKING]`
- Highlighted on the documentation site
- Cross-referenced with consuming repos

## Tech Stack

| Component | Technology |
|---|---|
| Static analysis | ts-morph |
| LLM | Claude (Anthropic SDK, runs in GitHub Action) |
| Documentation site | Astro |
| Search | Pagefind |
| Testing | Vitest |
| Package manager | pnpm workspaces |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages |

## Documentation

| Document | Description |
|---|---|
| [Architecture Overview](docs/00-overview.md) | System design, decisions, data flow |
| [Phase 0 - Pilot Selection](docs/01-phase-0-pilot.md) | Choosing pilot repositories |
| [Phase 1 - Contracts](docs/02-phase-1-contracts.md) | TypeScript type definitions |
| [Phase 2 - ChangeSet Model](docs/03-phase-2-changeset.md) | Differ algorithm |
| [Phase 3 - Extractor Package](docs/04-phase-3-extractor.md) | ts-morph extractors |
| [Phase 4 - GitHub Action](docs/05-phase-4-github-action.md) | CI/CD pipeline |
| [Phase 5 - Claude Generation](docs/06-phase-5-claude-service.md) | LLM integration |
| [Phase 6 - PR Bot](docs/07-phase-6-docs-pr-bot.md) | Automated PR creation |
| [Phase 7 - Breaking Changes](docs/08-phase-7-breaking.md) | Rule engine |
| [Phase 8 - Flow Detection](docs/09-phase-8-flows.md) | Cross-repo flows |
| [Phase 9 - Auto-Merge](docs/10-phase-9-auto-merge.md) | Synced merge lifecycle |
| [Astro Site](docs/11-astro-site.md) | Documentation site |
| [Source Repo Setup](docs/12-source-repo-setup.md) | Developer onboarding |
| [Testing Strategy](docs/13-testing-strategy.md) | Vitest + fixtures |
| [Roadmap](ROADMAP.md) | Timeline and milestones |

## Agent Skills

This repo includes [OpenCode agent skills](https://opencode.ai/docs/skills/) in `.opencode/skills/` that help AI agents implement the system:

| Skill | Purpose |
|---|---|
| `implement-phase` | Guide for implementing any phase — reads the phase doc and builds deliverables |
| `extract-patterns` | Writing ts-morph extractors for Express routes, DTOs, events, Prisma, frontend API calls |
| `claude-prompts` | Writing and tuning Claude prompt templates for HTML doc generation |
| `github-action` | Building the composite action, workflows, and cross-repo dispatch |
| `astro-site` | Building the Astro documentation site with auto-discovery and search |
| `breaking-changes` | Implementing the deterministic breaking change rule engine |
| `docs-pr-bot` | Building the PR creation bot and source PR commenting |

## Cost

| Resource | Monthly Estimate |
|---|---|
| Claude API (~200 PRs/month) | ~$15 |
| GitHub Actions (~400 min/month) | Free tier / org allotment |
| GitHub Pages | Free |
