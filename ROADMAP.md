# ROADMAP - Automated Documentation System

## Timeline Overview

**Total estimated duration: 5-6 weeks**

```
Week 1          Week 2          Week 3          Week 4          Week 5          Week 6
|---------------|---------------|---------------|---------------|---------------|---------------|
|== Phase 0 ==|                                                                                |
|   Pilot     |                                                                                |
|   Selection |                                                                                |
|             |== Phase 1 ==|                                                                  |
|             |  Contracts  |                                                                  |
|             |== Phase 2 ==|                                                                  |
|             |  ChangeSet  |                                                                  |
|             |             |========= Phase 3 ==========|                                     |
|             |             |  Extractor Package          |                                     |
|             |             |  + Tests & Fixtures         |                                     |
|             |             |                             |=== Phase 4 ===|                     |
|             |             |                             |  GitHub Action |                    |
|             |             |                             |=== Phase 5 ===|                     |
|             |             |                             |  Claude Gen   |                     |
|             |             |                             |               |== Phase 6 ==|       |
|             |             |                             |               |  PR Bot     |       |
|             |             |                             |               |== Phase 7 ==|       |
|             |             |                             |               |  Breaking   |       |
|             |             |                             |               |             |== 8 ==|
|             |             |                             |               |             | Flows |
|             |             |                             |               |             |== 9 ==|
|             |             |                             |               |             | Merge |
|             |                                                                                |
|             |============ Astro Site (parallel track) =======================================|
|             |  Can start as soon as contracts are defined (Phase 1)                          |
```

---

## Phase Schedule

| Phase | Name | Duration | Start | End | Dependencies |
|---|---|---|---|---|---|
| **0** | Pilot Selection | 2-3 days | Week 1, Day 1 | Week 1, Day 3 | None |
| **1** | Contracts | 1-2 days | Week 1, Day 3 | Week 2, Day 1 | Phase 0 |
| **2** | StructuredChangeSet / Differ | 1-2 days | Week 1, Day 3 | Week 2, Day 1 | Phase 1 |
| **3** | Extractor Package + Tests | 5-7 days | Week 2, Day 1 | Week 3, Day 3 | Phase 2 |
| **4** | GitHub Action | 3-4 days | Week 3, Day 3 | Week 4, Day 2 | Phase 3 |
| **5** | Claude Generation | 3-4 days | Week 3, Day 3 | Week 4, Day 2 | Phase 2 |
| **6** | Docs PR Bot | 2-3 days | Week 4, Day 2 | Week 5, Day 1 | Phase 5 |
| **7** | Breaking Changes | 2-3 days | Week 4, Day 2 | Week 5, Day 1 | Phase 2, 3 |
| **8** | Flow Detection | 3-4 days | Week 5, Day 1 | Week 5, Day 5 | Phase 3, 4 |
| **9** | Auto-Merge | 1-2 days | Week 5, Day 3 | Week 5, Day 5 | Phase 6 |
| **--** | Astro Site | 4-5 days | Week 2 | Week 5 | Phase 1 (parallel) |

**Note:** Phases 4 & 5 can be developed in parallel. Phases 6 & 7 can be developed in parallel.

---

## Milestones

### Milestone 1: Foundation Complete (End of Week 2)
> Contracts defined, differ implemented, extractor scaffolded

**Deliverables:**
- [ ] `contracts/DocFragment.ts` created and compiling
- [ ] `contracts/StructuredChangeSet.ts` created and compiling
- [ ] `contracts/BreakingChange.ts` created and compiling
- [ ] `packages/docs-extractor/` scaffolded with package.json, tsconfig, vitest
- [ ] `differ.ts` implemented with unit tests
- [ ] `registry.json` created with pilot repos
- [ ] pnpm workspace configured

**Exit criteria:** `pnpm build` and `pnpm test` pass in the extractor package.

---

### Milestone 2: Extraction Working (End of Week 3)
> All 5 extractors working against test fixtures

**Deliverables:**
- [ ] `express-routes.ts` extractor with tests
- [ ] `dto-models.ts` extractor with tests
- [ ] `events.ts` extractor with tests
- [ ] `prisma-schema.ts` extractor with tests
- [ ] `frontend-api-calls.ts` extractor with tests
- [ ] Fixture files for v1 and v2 (for diffing)
- [ ] Full extraction pipeline: `extract()` -> `diffExtractions()` -> `StructuredChangeSet`

**Exit criteria:** All extractor tests pass. Full pipeline produces valid `StructuredChangeSet` from fixtures.

---

### Milestone 3: End-to-End Pipeline (End of Week 4)
> PR in source repo triggers docs PR in company-docs

**Deliverables:**
- [ ] Composite action (`action.yml`) defined
- [ ] `extract.ts` script runs extractors in CI
- [ ] `generate.ts` script calls Claude and produces HTML
- [ ] `create-pr.ts` creates PR in company-docs
- [ ] `comment.ts` posts comment on source PR
- [ ] Claude prompt templates in `prompts/`
- [ ] Breaking change detection integrated

**Exit criteria:** A test PR in a pilot repo creates a documentation PR in company-docs with generated HTML and a comment on the source PR.

---

### Milestone 4: Full Automation (End of Week 5)
> Merge source PR -> docs PR auto-merges -> site rebuilds

**Deliverables:**
- [ ] Auto-merge workflow responds to source PR merge
- [ ] Auto-close workflow responds to source PR close
- [ ] Astro site builds from `services/` directory
- [ ] Site deploys to GitHub Pages
- [ ] Cross-service flow detection working
- [ ] Breaking change report generated for impacting changes

**Exit criteria:** Complete lifecycle works: create source PR -> docs PR created -> merge source PR -> docs PR auto-merged -> Astro site updated.

---

### Milestone 5: Pilot Complete (End of Week 6)
> Both pilot repos fully integrated and validated

**Deliverables:**
- [ ] `loan-api` (backend) fully integrated
- [ ] `web-checkout` (frontend) fully integrated
- [ ] Cross-service flows detected and documented
- [ ] Source repo setup guide tested by a developer who wasn't involved in building the system
- [ ] All success criteria met (see below)

**Exit criteria:** Pilot success criteria validated.

---

## Pilot Success Criteria

The pilot is successful when **all** of the following are true:

| # | Criteria | Validated By |
|---|---|---|
| 1 | Backend PR generates docs PR | Create test PR in loan-api, verify docs PR appears |
| 2 | Frontend PR generates docs PR | Create test PR in web-checkout, verify docs PR appears |
| 3 | DTO field removal detected as breaking | Remove a field from a DTO, verify breaking change in comment |
| 4 | API route removal detected as breaking | Remove a route, verify breaking change flagged |
| 5 | Nullable-to-required detected as breaking | Change optional field to required, verify detection |
| 6 | Flow auto-generated | Both repos integrated, verify flow appears in docs |
| 7 | Docs merged automatically on source merge | Merge source PR, verify docs PR auto-merges |
| 8 | Astro site updated | Verify site reflects new documentation after merge |
| 9 | No manual writing | Entire flow requires zero manual documentation effort |
| 10 | Source PR comment accurate | Comment contains correct links and breaking change info |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| ts-morph can't parse all Express patterns | Medium | High | Start with common patterns, add coverage over time. Log unrecognized patterns. | Phase 3 |
| Claude output varies between runs | Medium | Medium | Use structured output, validate against schema, retry with temperature=0 | Phase 5 |
| GitHub Action exceeds 6h timeout | Very Low | Low | Extraction is fast (~10s). Claude calls batch in <30s. Total ~90s. | Phase 4 |
| Cross-repo PAT token rotation | High | Medium | Use GitHub App instead of PAT for production. PAT acceptable for pilot. | Phase 0 |
| Large PRs overwhelm Claude context | Low | Medium | Cap extraction at top-level changes only. Chunk if >50 entities. | Phase 5 |
| Frontend URL patterns too diverse | Medium | Medium | Start with literal strings. Add template literal support post-pilot. | Phase 3 |
| Teams don't adopt | Medium | High | Make setup trivial (2 files). Show value in first PR. Get management buy-in. | Phase 0 |
| Breaking change false positives | Low | Medium | Rules are conservative. Only flag clear backward-incompatible changes. | Phase 7 |

---

## Post-Pilot Roadmap

After the pilot succeeds, the following are planned for wider rollout:

### Short-term (Weeks 7-8)
- [ ] Onboard 3-5 additional repositories
- [ ] Add NestJS extractor (decorator-based routing)
- [ ] Add Angular extractor (HttpClient patterns)
- [ ] Improve Claude prompts based on pilot feedback
- [ ] Add `[skip-docs]` PR title flag to opt out

### Medium-term (Weeks 9-12)
- [ ] Replace PAT with GitHub App for auth
- [ ] Add versioned documentation (keep history of changes)
- [ ] Add API diff view (before/after comparison)
- [ ] Integrate with Slack notifications for breaking changes
- [ ] Add GraphQL schema extraction
- [ ] Build dependency graph visualization (which service depends on which)

### Long-term (Q2+)
- [ ] OpenAPI/Swagger spec generation from extractors
- [ ] Contract testing: auto-generate test cases from DTOs
- [ ] AI-powered search across all documentation
- [ ] Multi-language support (Go, Python extractors)
- [ ] Documentation quality scoring
- [ ] Auto-detect stale documentation (code changed, docs not updated)

---

## Resource Requirements

### Infrastructure
- GitHub Actions minutes: ~2 min per PR, estimate 200 PRs/month = 400 min/month (well within free tier for public repos, or org allotment)
- Anthropic API: ~$15/month for 200 PRs
- GitHub Pages: Free

### People
- **1 developer full-time** for 5-6 weeks (pilot build)
- **0.5 developer** for ongoing maintenance post-pilot
- **Platform team** for secrets management and onboarding support

---

## Status Tracking

Update this section as work progresses:

| Phase | Status | Notes |
|---|---|---|
| Phase 0 | Not started | |
| Phase 1 | Done | Contracts defined in `contracts/` |
| Phase 2 | Done | `packages/docs-extractor/src/differ.ts` with full tests |
| Phase 3 | Done | 5 extractors + `extract()`/`extractAndDiff()` API with 63 tests |
| Phase 4 | Not started | |
| Phase 5 | Not started | |
| Phase 6 | Not started | |
| Phase 7 | Not started | |
| Phase 8 | Not started | |
| Phase 9 | Not started | |
| Astro Site | Not started | |
