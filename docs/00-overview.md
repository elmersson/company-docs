# Automated Documentation System - Architecture Overview

## Vision

An automated documentation pipeline that eliminates manual documentation writing. When a developer creates a PR in any connected repository, the system:

1. Extracts structural changes (APIs, models, events, schemas) using static analysis
2. Generates human-readable HTML documentation via Claude
3. Creates a PR in this central `company-docs` repository
4. Auto-merges the docs PR when the source PR merges

**Zero manual documentation. Docs always match production.**

---

## Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Package manager | pnpm workspaces | Fast installs, strict deps, best monorepo support |
| Testing | Vitest + fixtures | Fast, native ESM, ts-morph fixtures for extractor validation |
| LLM integration | Inside GitHub Action | No separate service to deploy. Anthropic SDK called directly. |
| Docs site | Astro | Zero JS by default, content-first, great for static docs |
| Extractor location | Monorepo (`packages/docs-extractor`) | Single source of truth. Source repos reference via composite action. |
| Frontend detection | React + fetch/axios patterns | Detects `fetch()` and `axios.*()` calls |
| Backend detection | Express.js patterns | Detects `router.get/post(...)` and `app.get/post(...)` |
| Action distribution | Reusable composite action | Source repos add one YAML file. Updates propagate automatically. |
| Auto-merge | Immediate on source PR merge | Docs always match production. No drift. |
| Pilot repos | Generic/configurable | System works with any Express backend or React frontend |

---

## Repository Structure

```
company-docs/
├── .github/
│   ├── actions/
│   │   └── docs-sync/                  # Reusable composite action
│   │       ├── action.yml              # Action definition
│   │       └── scripts/
│   │           ├── extract.ts          # Run extractor on base + head
│   │           ├── generate.ts         # Call Claude with StructuredChangeSet
│   │           └── create-pr.ts        # Create PR in company-docs
│   └── workflows/
│       ├── build-site.yml              # Build & deploy Astro on merge to main
│       └── auto-merge-docs.yml         # Auto-merge docs PR on source merge
│
├── packages/
│   └── docs-extractor/                 # @company/docs-extractor
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── index.ts                # Public API
│       │   ├── types.ts                # All shared types
│       │   ├── extractors/
│       │   │   ├── express-routes.ts   # Express route extraction
│       │   │   ├── dto-models.ts       # Interface/type extraction
│       │   │   ├── events.ts           # Event publish detection
│       │   │   ├── prisma-schema.ts    # Prisma schema parsing
│       │   │   └── frontend-api-calls.ts # fetch/axios detection
│       │   ├── differ.ts               # Diff base vs head extractions
│       │   └── breaking-changes.ts     # Breaking change rule engine
│       └── tests/
│           ├── fixtures/               # Example Express/React code
│           │   ├── express-app/
│           │   └── react-app/
│           ├── express-routes.test.ts
│           ├── dto-models.test.ts
│           ├── events.test.ts
│           ├── prisma-schema.test.ts
│           ├── frontend-api-calls.test.ts
│           ├── differ.test.ts
│           └── breaking-changes.test.ts
│
├── contracts/                          # Shared type contracts
│   ├── DocFragment.ts
│   ├── StructuredChangeSet.ts
│   └── BreakingChange.ts
│
├── prompts/                            # Claude prompt templates
│   ├── api-docs.md
│   ├── model-docs.md
│   ├── event-docs.md
│   ├── flow-docs.md
│   └── breaking-change.md
│
├── site/                               # Astro documentation site
│   ├── astro.config.mjs
│   ├── package.json
│   └── src/
│       ├── layouts/DocsLayout.astro
│       ├── pages/
│       │   ├── index.astro             # Dashboard
│       │   └── [...slug].astro         # Dynamic doc pages
│       ├── components/
│       │   ├── ServiceNav.astro
│       │   ├── FlowDiagram.astro
│       │   ├── BreakingBadge.astro
│       │   └── SearchBar.astro
│       └── styles/global.css
│
├── services/                           # Generated docs (auto-committed)
│   └── {service-name}/
│       ├── api/{endpoint}.html
│       ├── models/{ModelName}.html
│       ├── events/{EventName}.html
│       ├── flows/{FlowName}.html
│       └── breaking-changes/pr-{n}.html
│
├── registry.json                       # Connected repos configuration
├── ROADMAP.md                          # Timeline & milestones
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

---

## System Data Flow

```
Developer creates PR in loan-api
         |
         v
GitHub Action triggers (.github/workflows/docs-sync.yml in loan-api)
         |
         v
Uses reusable composite action from company-docs
         |
         |--- 1. Checkout base branch + head branch
         |
         |--- 2. Run @company/docs-extractor on BASE
         |         -> base-extraction.json
         |
         |--- 3. Run @company/docs-extractor on HEAD
         |         -> head-extraction.json
         |
         |--- 4. Diff extractions
         |         -> StructuredChangeSet.json
         |
         |--- 5. Detect breaking changes
         |         -> BreakingChange[] (rule-based, no LLM)
         |
         |--- 6. Call Claude API (Anthropic SDK)
         |         Input:  StructuredChangeSet
         |         Prompts: from prompts/ directory
         |         Output: DocFragment[] (HTML)
         |
         |--- 7. Write HTML to services/{service}/...
         |
         |--- 8. Create PR in company-docs
         |         Branch: docs/{service}/pr-{number}
         |
         '--- 9. Post summary comment on source PR
                   Links to docs PR + breaking change warnings

         ... developer reviews and merges source PR ...

Source PR merged
         |
         v
Merge notification (repository_dispatch)
         |
         v
auto-merge-docs.yml in company-docs
         |
         v
Docs PR auto-merged
         |
         v
build-site.yml triggers -> Astro site built & deployed
```

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Static analysis | ts-morph | ^22.0.0 |
| LLM | Claude (Anthropic SDK) | claude-sonnet-4-20250514 |
| Docs site | Astro | ^4.0.0 |
| Testing | Vitest | ^2.0.0 |
| Package manager | pnpm | ^9.0.0 |
| CI/CD | GitHub Actions | v4 |
| Schema parsing | @prisma/internals | latest |

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| Anthropic API key exposure | Stored as GitHub Actions secret. Never logged. |
| Cross-repo write access | Fine-grained PAT scoped to `company-docs` only |
| LLM prompt injection via code | Claude receives StructuredChangeSet (structured data), never raw source code |
| Sensitive code in docs | Extractor outputs type signatures and route paths only. No implementation logic. |

---

## Phase Dependencies

```
Phase 0 (Pilot Selection)
    |
    v
Phase 1 (Contracts) -------------------------+
    |                                          |
    v                                          |
Phase 2 (StructuredChangeSet) ------+         |
    |                                |         |
    v                                v         v
Phase 3 (Extractor Package) --> Phase 4 (GitHub Action)
    |                               |
    |                               v
    |                          Phase 5 (Claude Generation)
    |                               |
    |                               v
    |                          Phase 6 (Docs PR Bot)
    |                               |
    v                               v
Phase 7 (Breaking Changes) --> Phase 8 (Flow Detection)
                                    |
                                    v
                               Phase 9 (Auto-Merge)
```

---

## Next Steps

Read each phase document in order:

1. `01-phase-0-pilot.md` - Pilot Selection
2. `02-phase-1-contracts.md` - Documentation Contract
3. `03-phase-2-changeset.md` - StructuredChangeSet Model
4. `04-phase-3-extractor.md` - TypeScript Extractor Package
5. `05-phase-4-github-action.md` - GitHub Action
6. `06-phase-5-claude-service.md` - Claude Generation
7. `07-phase-6-docs-pr-bot.md` - Docs PR Bot
8. `08-phase-7-breaking.md` - Breaking Change Detection
9. `09-phase-8-flows.md` - Flow Detection
10. `10-phase-9-auto-merge.md` - Approval Synced Merge
11. `11-astro-site.md` - Astro Documentation Site
12. `12-source-repo-setup.md` - Source Repo Setup Guide
13. `13-testing-strategy.md` - Testing Strategy

Timeline and milestones: `ROADMAP.md`
