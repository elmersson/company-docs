/**
 * create-pr.ts — Phase 6
 *
 * Reads DocFragment[] from fragments.json, writes the HTML files to
 * the services/ directory in company-docs, and creates (or updates)
 * a PR in company-docs linked back to the source PR.
 *
 * Environment variables (set by action.yml):
 *   GITHUB_TOKEN     — PAT with write access to company-docs
 *   DOCS_REPO        — documentation repo (org/repo format)
 *   SERVICE_NAME     — service name (e.g. "loan-api")
 *   PR_NUMBER        — source PR number
 *   SOURCE_REPO      — source repo (org/repo format)
 *   SOURCE_PR_URL    — source PR HTML URL
 *   FRAGMENTS_PATH   — path to fragments.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "fs"
import { dirname, join } from "path"
import { execSync } from "child_process"
import type { DocFragment } from "../../../../contracts/DocFragment.js"

// ---------------------------------------------------------------------------
// Read environment
// ---------------------------------------------------------------------------

const fragmentsPath = process.env.FRAGMENTS_PATH ?? "/tmp/docs-sync/fragments.json"
const serviceName = process.env.SERVICE_NAME ?? "unknown"
const prNumber = process.env.PR_NUMBER ?? "0"
const sourceRepo = process.env.SOURCE_REPO ?? "unknown/unknown"
const sourcePrUrl = process.env.SOURCE_PR_URL ?? ""
const docsRepo = process.env.DOCS_REPO ?? "elmersson/company-docs"
const token = process.env.GITHUB_TOKEN!

const branch = `docs/${serviceName}/pr-${prNumber}`
const docsDir = "/tmp/docs-sync/company-docs"

// ---------------------------------------------------------------------------
// Read fragments
// ---------------------------------------------------------------------------

if (!existsSync(fragmentsPath)) {
  console.log("No fragments.json found — nothing to commit.")
  process.exit(0)
}

const fragments: DocFragment[] = JSON.parse(readFileSync(fragmentsPath, "utf-8"))

if (fragments.length === 0) {
  console.log("No fragments generated — skipping PR creation.")
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Read breaking changes (for PR body)
// ---------------------------------------------------------------------------

const breakingChangesPath = process.env.BREAKING_CHANGES_PATH ?? "/tmp/docs-sync/breaking-changes.json"

const breakingChanges: { type: string; entity: string; field?: string; details: string; severity: string; affectedConsumers?: string[] }[] =
  existsSync(breakingChangesPath)
    ? JSON.parse(readFileSync(breakingChangesPath, "utf-8"))
    : []

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: docsDir, encoding: "utf-8" }).trim()
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

async function findExistingPr(): Promise<{ html_url: string; number: number } | null> {
  const owner = docsRepo.split("/")[0]
  const response = await fetch(
    `https://api.github.com/repos/${docsRepo}/pulls?head=${owner}:${branch}&state=open`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to search PRs: ${response.status} ${await response.text()}`)
  }

  const prs = await response.json()
  return prs.length > 0 ? prs[0] : null
}

async function createPr(): Promise<{ html_url: string; number: number }> {
  const hasBreaking = breakingChanges.length > 0
  const title = hasBreaking
    ? `[BREAKING] docs(${serviceName}): PR #${prNumber}`
    : `docs(${serviceName}): PR #${prNumber}`

  const body = buildPrBody()

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
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to create PR: ${response.status} ${await response.text()}`)
  }

  return response.json()
}

// ---------------------------------------------------------------------------
// PR body builder
// ---------------------------------------------------------------------------

function buildPrBody(): string {
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

// ---------------------------------------------------------------------------
// GitHub Actions output helper
// ---------------------------------------------------------------------------

function setOutput(name: string, value: string) {
  // Write to GITHUB_ENV so subsequent steps can read via ${{ env.NAME }}
  const envFile = process.env.GITHUB_ENV
  if (envFile) {
    appendFileSync(envFile, `${name}=${value}\n`)
  }
  // Also write to GITHUB_OUTPUT for step output access
  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}\n`)
  }
  // Also set on process.env for same-script access
  process.env[name] = value
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function createDocsPr() {
  console.log(`Creating docs PR in ${docsRepo} for ${sourceRepo}#${prNumber}`)
  console.log(`  Service: ${serviceName}`)
  console.log(`  Fragments: ${fragments.length}`)
  console.log(`  Branch: ${branch}`)

  // 1. Configure git
  git(`config user.name "docs-sync-bot"`)
  git(`config user.email "docs-sync-bot@noreply.github.com"`)

  // 2. Create or reset branch from main
  try {
    git(`checkout -B ${branch}`)
  } catch {
    git(`checkout -b ${branch}`)
  }

  // 3. Write HTML files
  for (const fragment of fragments) {
    const filePath = join(docsDir, "services", fragment.outputPath)
    const dir = dirname(filePath)
    mkdirSync(dir, { recursive: true })
    writeFileSync(filePath, fragment.html, "utf-8")
    console.log(`  Wrote: services/${fragment.outputPath}`)
  }

  // 4. Write metadata file (for Astro site to consume)
  const metadata = fragments.map((f) => ({
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
    docsDir, "services", serviceName, `_meta-pr-${prNumber}.json`,
  )
  mkdirSync(dirname(metadataPath), { recursive: true })
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  console.log(`  Wrote: services/${serviceName}/_meta-pr-${prNumber}.json`)

  // 5. Commit
  git(`add services/`)

  const hasChanges = git(`diff --cached --name-only`)

  if (!hasChanges) {
    console.log("No documentation changes to commit.")
    return
  }

  const commitMsg = [
    `docs(${serviceName}): auto-generated from PR #${prNumber}`,
    ``,
    `Source: ${sourcePrUrl}`,
    `Generated: ${new Date().toISOString()}`,
  ].join("\n")
  execSync(`git commit -m ${JSON.stringify(commitMsg)}`, { cwd: docsDir })

  // 6. Push branch
  const remoteUrl = `https://x-access-token:${token}@github.com/${docsRepo}.git`
  execSync(`git push --force ${remoteUrl} ${branch}`, { cwd: docsDir })

  console.log(`  Pushed branch: ${branch}`)

  // 7. Create or update PR
  const existingPr = await findExistingPr()

  if (existingPr) {
    console.log(`Updated existing docs PR: ${existingPr.html_url}`)
    setOutput("DOCS_PR_URL", existingPr.html_url)
  } else {
    const pr = await createPr()
    console.log(`Created docs PR: ${pr.html_url}`)
    setOutput("DOCS_PR_URL", pr.html_url)
  }
}

createDocsPr().catch((err) => {
  console.error("Failed to create docs PR:", err)
  process.exit(1)
})
