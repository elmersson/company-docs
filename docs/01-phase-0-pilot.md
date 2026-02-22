# Phase 0 - Pilot Repository Selection

**Duration:** 2-3 days
**Dependencies:** None
**Outcome:** Two repositories selected and configured for the pilot

---

## Objective

Select one backend and one frontend repository to pilot the automated documentation system. These repos must be actively developed with frequent PRs to validate the pipeline end-to-end.

---

## Selection Criteria

| Criteria | Why |
|---|---|
| Active development | Need frequent PRs to test the pipeline |
| Express.js backend | Extractor targets Express routing patterns |
| React + fetch/axios frontend | Extractor targets fetch/axios API call patterns |
| Uses TypeScript | ts-morph requires TypeScript source files |
| Has DTOs/interfaces | Need structured types to extract |
| Has Prisma (optional) | Enables schema change detection |

---

## Recommended Pilot Repos

| Type | Repo | Reason |
|---|---|---|
| Backend | `loan-api` | Express.js, TypeScript, Prisma, well-structured DTOs |
| Frontend | `web-checkout` | React, fetch/axios, consumes loan-api endpoints |

### Why Frontend Matters

Frontend is not optional in this pilot. UI contract changes are the #1 source of undocumented API breakages:

- Frontend removes usage of a field — nobody updates backend docs
- Backend removes a field — frontend breaks silently
- Frontend starts calling a new endpoint — no documentation exists

The system must detect when frontend and backend are out of sync.

---

## Deliverables

### 1. Repository Audit Checklist

For each pilot repo, verify:

```
[ ] TypeScript project (tsconfig.json exists)
[ ] Express.js routing (backend) OR React + fetch/axios (frontend)
[ ] Exported interfaces/types for DTOs
[ ] GitHub Actions enabled
[ ] Team willing to participate in pilot
[ ] Can add org-level secrets (ANTHROPIC_API_KEY, DOCS_REPO_TOKEN)
```

### 2. Registry Entry

Add each pilot repo to `registry.json` at the root of `company-docs`:

```json
{
  "services": [
    {
      "name": "loan-api",
      "repo": "your-org/loan-api",
      "type": "backend",
      "framework": "express",
      "entryPoints": ["src/routes/**/*.ts"],
      "dtoPatterns": ["src/dto/**/*.ts", "src/models/**/*.ts"],
      "eventPatterns": ["src/events/**/*.ts"],
      "prismaSchema": "prisma/schema.prisma"
    },
    {
      "name": "web-checkout",
      "repo": "your-org/web-checkout",
      "type": "frontend",
      "framework": "react",
      "apiCallPatterns": ["src/api/**/*.ts", "src/services/**/*.ts"],
      "dtoPatterns": ["src/types/**/*.ts"]
    }
  ]
}
```

### 3. Secrets Configuration

Create these GitHub secrets at the org level (or per-repo):

| Secret | Purpose | Scope |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API access for doc generation | Read-only, no file access |
| `DOCS_REPO_TOKEN` | GitHub PAT to create PRs in `company-docs` | Fine-grained: `company-docs` repo only |

**Creating the fine-grained PAT:**

1. GitHub Settings > Developer Settings > Fine-grained tokens
2. Token name: `docs-sync-bot`
3. Repository access: Only select `company-docs`
4. Permissions:
   - Contents: Read and write
   - Pull requests: Read and write
   - Metadata: Read-only

---

## Acceptance Criteria

- [ ] Two repos selected (one backend, one frontend)
- [ ] Both repos audited against the checklist
- [ ] `registry.json` created with both repos
- [ ] GitHub secrets configured
- [ ] Teams notified and onboarded

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Repo uses non-standard Express patterns | Extractor misses routes | Audit routing patterns before Phase 3 |
| Repo not in TypeScript | ts-morph won't work | Select TypeScript repos only |
| Team resistance | Slow adoption | Start with willing teams, show value fast |
