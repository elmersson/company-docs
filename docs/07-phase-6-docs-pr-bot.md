# Phase 6 - Docs Repo Pull Request Bot

**Duration:** 2-3 days
**Dependencies:** Phase 5 (Claude generates DocFragment[])
**Outcome:** Automated PR creation in company-docs with generated HTML files

---

## Objective

After Claude generates `DocFragment[]`, the bot writes the HTML files to the correct paths in `company-docs` and creates a PR. The PR is linked back to the source PR so developers can review the generated docs.

---

## PR Branch Strategy

Each source PR gets a dedicated docs branch:

```
docs/{service-name}/pr-{number}
```

Examples:
- `docs/loan-api/pr-482`
- `docs/web-checkout/pr-115`

If the source PR is updated (new commits pushed), the existing docs branch is force-updated with the new documentation.

---

## Implementation

### `scripts/create-pr.ts`

```typescript
import { readFileSync, writeFileSync, mkdirSync } from "fs"
import { dirname, join } from "path"
import { execSync } from "child_process"
import type { DocFragment } from "../../../contracts/DocFragment"

const fragments: DocFragment[] = JSON.parse(
  readFileSync(process.env.FRAGMENTS_PATH!, "utf-8")
)

const docsRepo = process.env.DOCS_REPO!
const serviceName = process.env.SERVICE_NAME!
const prNumber = process.env.PR_NUMBER!
const sourceRepo = process.env.SOURCE_REPO!
const sourcePrUrl = process.env.SOURCE_PR_URL!
const token = process.env.GITHUB_TOKEN!

const branch = `docs/${serviceName}/pr-${prNumber}`
const docsDir = "/tmp/docs-sync/company-docs"

async function createDocsPr() {
  // 1. Configure git
  execSync(`git config user.name "docs-sync-bot"`, { cwd: docsDir })
  execSync(`git config user.email "docs-sync-bot@noreply.github.com"`, { cwd: docsDir })

  // 2. Create or reset branch
  try {
    execSync(`git checkout -B ${branch}`, { cwd: docsDir })
  } catch {
    execSync(`git checkout -b ${branch}`, { cwd: docsDir })
  }

  // 3. Write HTML files
  for (const fragment of fragments) {
    const filePath = join(docsDir, "services", fragment.outputPath)
    const dir = dirname(filePath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, fragment.html, "utf-8")
    console.log(`Wrote: services/${fragment.outputPath}`)
  }

  // 4. Write metadata file (for Astro site to consume)
  const metadata = fragments.map(f => ({
    service: f.service,
    docType: f.docType,
    entity: f.entity,
    outputPath: f.outputPath,
    hasBreakingChanges: f.hasBreakingChanges,
    generatedAt: f.generatedAt,
    sourceRepo: f.sourceRepo,
    sourcePr: f.sourcePr,
  }))

  const metadataPath = join(
    docsDir, "services", serviceName, `_meta-pr-${prNumber}.json`
  )
  mkdirSync(dirname(metadataPath), { recursive: true })
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))

  // 5. Commit
  execSync(`git add services/`, { cwd: docsDir })

  const hasChanges = execSync(`git diff --cached --name-only`, { cwd: docsDir })
    .toString().trim()

  if (!hasChanges) {
    console.log("No documentation changes to commit.")
    return
  }

  const commitMsg = `docs(${serviceName}): auto-generated from PR #${prNumber}

Source: ${sourcePrUrl}
Generated: ${new Date().toISOString()}`

  execSync(`git commit -m "${commitMsg}"`, { cwd: docsDir })

  // 6. Push branch
  const remoteUrl = `https://x-access-token:${token}@github.com/${docsRepo}.git`
  execSync(`git push --force ${remoteUrl} ${branch}`, { cwd: docsDir })

  // 7. Create or update PR
  const existingPr = await findExistingPr(branch)

  if (existingPr) {
    console.log(`Updated existing docs PR: ${existingPr.html_url}`)
    // Export for comment step
    setOutput("DOCS_PR_URL", existingPr.html_url)
  } else {
    const pr = await createPr(branch)
    console.log(`Created docs PR: ${pr.html_url}`)
    setOutput("DOCS_PR_URL", pr.html_url)
  }
}

async function findExistingPr(branch: string) {
  const response = await fetch(
    `https://api.github.com/repos/${docsRepo}/pulls?head=${docsRepo.split("/")[0]}:${branch}&state=open`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  )
  const prs = await response.json()
  return prs.length > 0 ? prs[0] : null
}

async function createPr(branch: string) {
  const breakingChanges = JSON.parse(
    readFileSync("/tmp/docs-sync/breaking-changes.json", "utf-8")
  )

  const hasBreaking = breakingChanges.length > 0
  const title = hasBreaking
    ? `[BREAKING] docs(${serviceName}): PR #${prNumber}`
    : `docs(${serviceName}): PR #${prNumber}`

  const body = buildPrBody(fragments, breakingChanges, sourcePrUrl)

  const response = await fetch(
    `https://api.github.com/repos/${docsRepo}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        body,
        head: branch,
        base: "main",
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to create PR: ${response.status} ${await response.text()}`)
  }

  return response.json()
}

function buildPrBody(
  fragments: DocFragment[],
  breakingChanges: any[],
  sourcePrUrl: string
): string {
  const lines: string[] = []

  lines.push(`## Auto-Generated Documentation`)
  lines.push(``)
  lines.push(`**Source PR:** ${sourcePrUrl}`)
  lines.push(`**Service:** ${serviceName}`)
  lines.push(`**Generated:** ${new Date().toISOString()}`)
  lines.push(``)

  // Breaking changes section
  if (breakingChanges.length > 0) {
    lines.push(`### Breaking Changes`)
    lines.push(``)
    for (const bc of breakingChanges) {
      const icon = bc.severity === "critical" ? "🔴" : "🟡"
      lines.push(`- ${icon} **${bc.type}**: ${bc.entity}${bc.field ? `.${bc.field}` : ""} — ${bc.details}`)
    }
    lines.push(``)
  }

  // Files changed
  lines.push(`### Documentation Files`)
  lines.push(``)
  for (const f of fragments) {
    const badge = f.hasBreakingChanges ? " ⚠️" : ""
    lines.push(`- \`services/${f.outputPath}\` (${f.docType})${badge}`)
  }
  lines.push(``)

  lines.push(`---`)
  lines.push(`*This PR was auto-generated by the documentation sync system.*`)
  lines.push(`*It will be auto-merged when the source PR is merged.*`)

  return lines.join("\n")
}

function setOutput(name: string, value: string) {
  // Set GitHub Actions output
  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile) {
    const fs = require("fs")
    fs.appendFileSync(outputFile, `${name}=${value}\n`)
  }
  // Also set as env var for subsequent steps
  process.env[name] = value
}

createDocsPr().catch(err => {
  console.error("Failed to create docs PR:", err)
  process.exit(1)
})
```

---

## Comment on Source PR

### `scripts/comment.ts`

Posts a comment on the source PR linking to the docs PR and highlighting breaking changes.

```typescript
import { readFileSync } from "fs"

const prNumber = process.env.PR_NUMBER!
const docsPrUrl = process.env.DOCS_PR_URL!
const token = process.env.GITHUB_TOKEN!
const repo = process.env.GITHUB_REPOSITORY!

const breakingChanges = JSON.parse(
  readFileSync(process.env.BREAKING_CHANGES_PATH!, "utf-8")
)

async function postComment() {
  const lines: string[] = []

  lines.push(`### Documentation Sync`)
  lines.push(``)
  lines.push(`Documentation has been auto-generated for this PR.`)
  lines.push(``)
  lines.push(`**Docs PR:** ${docsPrUrl}`)
  lines.push(``)

  if (breakingChanges.length > 0) {
    lines.push(`### Breaking Changes Detected`)
    lines.push(``)
    for (const bc of breakingChanges) {
      const icon = bc.severity === "critical" ? "🔴" : "🟡"
      lines.push(`- ${icon} **${bc.type}**: \`${bc.entity}${bc.field ? `.${bc.field}` : ""}\``)
      lines.push(`  ${bc.details}`)
      if (bc.affectedConsumers?.length) {
        lines.push(`  Affected: ${bc.affectedConsumers.join(", ")}`)
      }
    }
    lines.push(``)
  }

  lines.push(`---`)
  lines.push(`*When this PR is merged, the docs PR will be auto-merged.*`)

  // Find and update existing comment, or create new one
  const marker = "<!-- docs-sync-comment -->"
  const body = `${marker}\n${lines.join("\n")}`

  const existingComment = await findExistingComment(marker)

  if (existingComment) {
    await updateComment(existingComment.id, body)
  } else {
    await createComment(body)
  }
}

async function findExistingComment(marker: string) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  )
  const comments = await response.json()
  return comments.find((c: any) => c.body?.includes(marker))
}

async function createComment(body: string) {
  await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    }
  )
}

async function updateComment(commentId: number, body: string) {
  await fetch(
    `https://api.github.com/repos/${repo}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    }
  )
}

postComment().catch(err => {
  console.error("Failed to post comment:", err)
  process.exit(1)
})
```

---

## File Output Structure

For a PR that adds a loan application endpoint:

```
services/
└── loan-api/
    ├── api/
    │   └── post-loan-apply.html
    ├── models/
    │   ├── LoanApplicationDto.html
    │   └── LoanResultDto.html
    ├── events/
    │   └── LoanCreatedEvent.html
    ├── breaking-changes/
    │   └── pr-482.html          (only if breaking changes exist)
    └── _meta-pr-482.json        (metadata for Astro site)
```

---

## PR Lifecycle

```
1. Source PR created
   -> Docs PR created (draft-like, linked)

2. Source PR updated (new commits)
   -> Docs branch force-pushed, docs PR updated
   -> Source PR comment updated

3. Source PR merged
   -> Docs PR auto-merged (Phase 9)

4. Source PR closed (not merged)
   -> Docs PR should be closed too
      (handled by auto-merge workflow detecting closed state)
```

---

## Acceptance Criteria

- [ ] `create-pr.ts` creates docs PR with correct branch naming
- [ ] HTML files written to correct paths under `services/`
- [ ] Metadata JSON written for Astro site consumption
- [ ] PR body includes file list, breaking changes, and source PR link
- [ ] Existing docs PR updated (not duplicated) on source PR updates
- [ ] Comment posted on source PR with docs PR link
- [ ] Comment updated (not duplicated) on subsequent runs
- [ ] Breaking changes prominently displayed in both PR body and comment
