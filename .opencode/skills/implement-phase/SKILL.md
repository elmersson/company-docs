---
name: implement-phase
description: Guide for implementing any phase of the automated documentation system. Reads the phase doc, understands contracts, and builds the deliverables with tests.
---

## What I do

Help implement any phase (0-9) of the automated documentation system by:

1. Reading the relevant phase document from `docs/`
2. Understanding the type contracts in `contracts/`
3. Building the deliverables described in the phase doc
4. Writing tests where applicable
5. Verifying acceptance criteria

## Context

This is a monorepo using pnpm workspaces. The project structure:

```
company-docs/
├── contracts/           # Shared TypeScript types (DocFragment, StructuredChangeSet, BreakingChange)
├── packages/
│   └── docs-extractor/  # @company/docs-extractor - ts-morph based extraction
├── .github/
│   ├── actions/docs-sync/  # Reusable composite action
│   └── workflows/          # CI/CD workflows
├── prompts/             # Claude prompt templates
├── site/                # Astro documentation site
├── services/            # Generated HTML docs (auto-committed)
├── registry.json        # Connected repos config
└── docs/                # Phase documentation (00 through 13)
```

## How to implement a phase

1. Read the phase document: `docs/{number}-phase-{n}-{name}.md`
2. Read any dependency phase docs listed at the top
3. Read the contracts in `contracts/` to understand the type system
4. Implement each deliverable listed in the phase doc
5. Follow the code examples provided — they are the intended implementation
6. Write tests using Vitest with fixtures in `packages/docs-extractor/tests/`
7. Check each acceptance criterion at the bottom of the phase doc

## Key rules

- All types must conform to the contracts in `contracts/`. Do not deviate.
- The extractor package lives at `packages/docs-extractor/`
- Use pnpm, not npm or yarn
- Use Vitest for testing, not Jest
- Use ESM (`"type": "module"` in package.json)
- TypeScript strict mode is required
- Claude never sees raw git diffs — only `StructuredChangeSet`
- Breaking change detection is rule-based, never LLM-based
- Generated HTML must be fragments (no `<html>`, `<head>`, `<body>` wrappers)

## Phase mapping

| Phase | Doc file | Primary deliverable |
|---|---|---|
| 0 | `docs/01-phase-0-pilot.md` | `registry.json`, secrets config |
| 1 | `docs/02-phase-1-contracts.md` | `contracts/*.ts` |
| 2 | `docs/03-phase-2-changeset.md` | `packages/docs-extractor/src/differ.ts` |
| 3 | `docs/04-phase-3-extractor.md` | `packages/docs-extractor/src/extractors/*.ts` |
| 4 | `docs/05-phase-4-github-action.md` | `.github/actions/docs-sync/` |
| 5 | `docs/06-phase-5-claude-service.md` | `prompts/*.md`, `scripts/generate.ts` |
| 6 | `docs/07-phase-6-docs-pr-bot.md` | `scripts/create-pr.ts`, `scripts/comment.ts` |
| 7 | `docs/08-phase-7-breaking.md` | `packages/docs-extractor/src/breaking-changes.ts` |
| 8 | `docs/09-phase-8-flows.md` | Flow detection in site or extractor |
| 9 | `docs/10-phase-9-auto-merge.md` | `.github/workflows/auto-merge-docs.yml` |

## When to use me

Use this skill when the user asks to implement, build, or start work on any phase of the project. Read the corresponding phase doc first, then build exactly what it specifies.
