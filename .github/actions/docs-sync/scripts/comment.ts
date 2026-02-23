/**
 * comment.ts — Phase 6
 *
 * Posts (or updates) a comment on the source PR with a link to the
 * docs PR and any breaking change warnings.
 *
 * Environment variables (set by action.yml):
 *   GITHUB_TOKEN          — source repo token (github.token)
 *   PR_NUMBER             — source PR number
 *   DOCS_PR_URL           — docs PR URL (set by create-pr.ts)
 *   BREAKING_CHANGES_PATH — path to breaking-changes.json
 *   GITHUB_REPOSITORY     — source repo (org/repo), set automatically
 */

import { readFileSync, existsSync } from "fs"
import { join } from "path"
import type { BreakingChange } from "../../../../contracts/BreakingChange.js"

// ---------------------------------------------------------------------------
// Read environment
// ---------------------------------------------------------------------------

const SYNC_DIR = process.env.SYNC_DIR ?? "/tmp/docs-sync"
const prNumber = process.env.PR_NUMBER ?? "0"
const docsPrUrl = process.env.DOCS_PR_URL ?? ""
const token = process.env.GITHUB_TOKEN!
const repo = process.env.GITHUB_REPOSITORY!
const breakingChangesPath = process.env.BREAKING_CHANGES_PATH ?? join(SYNC_DIR, "breaking-changes.json")

// ---------------------------------------------------------------------------
// Read breaking changes
// ---------------------------------------------------------------------------

const breakingChanges: BreakingChange[] = existsSync(breakingChangesPath)
  ? JSON.parse(readFileSync(breakingChangesPath, "utf-8"))
  : []

// ---------------------------------------------------------------------------
// Comment body builder
// ---------------------------------------------------------------------------

const COMMENT_MARKER = "<!-- docs-sync-comment -->"

function buildCommentBody(): string {
  const lines: string[] = []

  lines.push(COMMENT_MARKER)
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

  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

async function findExistingComment(): Promise<{ id: number; body: string } | null> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to list comments: ${response.status} ${await response.text()}`)
  }

  const comments: { id: number; body: string }[] = await response.json()
  return comments.find((c) => c.body?.includes(COMMENT_MARKER)) ?? null
}

async function createComment(body: string) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to create comment: ${response.status} ${await response.text()}`)
  }
}

async function updateComment(commentId: number, body: string) {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to update comment: ${response.status} ${await response.text()}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function postComment() {
  if (!docsPrUrl) {
    console.log("No DOCS_PR_URL set — skipping comment.")
    process.exit(0)
  }

  console.log(`Posting comment on source PR #${prNumber}`)
  console.log(`  Docs PR: ${docsPrUrl}`)
  console.log(`  Breaking changes: ${breakingChanges.length}`)

  const body = buildCommentBody()
  const existingComment = await findExistingComment()

  if (existingComment) {
    await updateComment(existingComment.id, body)
    console.log(`Updated existing comment (id: ${existingComment.id})`)
  } else {
    await createComment(body)
    console.log("Created new comment on source PR")
  }
}

postComment().catch((err) => {
  console.error("Failed to post comment:", err)
  process.exit(1)
})
