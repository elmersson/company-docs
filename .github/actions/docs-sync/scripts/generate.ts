/**
 * generate.ts — Phase 5
 *
 * Calls the Claude API with sections of the StructuredChangeSet and
 * produces DocFragment[] (HTML documentation fragments).
 *
 * Environment variables (set by action.yml):
 *   ANTHROPIC_API_KEY      — Anthropic API key
 *   CHANGESET_PATH         — path to changeset.json
 *   BREAKING_CHANGES_PATH  — path to breaking-changes.json
 *   SERVICE_NAME           — service name (e.g. "loan-api")
 */

import Anthropic from "@anthropic-ai/sdk"
import { readFileSync, writeFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type {
  StructuredChangeSet,
  BreakingChange,
  RouteChange,
  ModelChange,
  EventChange,
  FlowMatch,
  DocFragment,
} from "../../../../packages/docs-extractor/src/types.js"
import { detectFlows } from "../../../../packages/docs-extractor/src/flow-detector.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROMPTS_DIR = join(__dirname, "../../../../prompts")
const MAX_CONCURRENCY = 5
const MAX_RETRIES = 3

// ---------------------------------------------------------------------------
// Read inputs
// ---------------------------------------------------------------------------

const changesetPath = process.env.CHANGESET_PATH ?? "/tmp/docs-sync/changeset.json"
const breakingChangesPath = process.env.BREAKING_CHANGES_PATH ?? "/tmp/docs-sync/breaking-changes.json"
const serviceName = process.env.SERVICE_NAME ?? "unknown"

if (!existsSync(changesetPath)) {
  console.log("No changeset.json found — nothing to generate.")
  process.exit(0)
}

const changeSet: StructuredChangeSet = JSON.parse(
  readFileSync(changesetPath, "utf-8"),
)

const breakingChanges: BreakingChange[] = existsSync(breakingChangesPath)
  ? JSON.parse(readFileSync(breakingChangesPath, "utf-8"))
  : []

// ---------------------------------------------------------------------------
// Claude API client
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

async function callClaude(promptFile: string, data: object): Promise<string> {
  const promptPath = join(PROMPTS_DIR, promptFile)
  const systemPrompt = readFileSync(promptPath, "utf-8")

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify(data, null, 2),
      },
    ],
  })

  const textBlock = response.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response")
  }

  return sanitizeHtml(textBlock.text)
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

async function callClaudeWithRetry(
  promptFile: string,
  data: object,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callClaude(promptFile, data)
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error

      const delay = Math.pow(2, attempt) * 1000
      console.log(
        `Claude API call failed (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${delay}ms...`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error("Unreachable")
}

// ---------------------------------------------------------------------------
// Output validation
// ---------------------------------------------------------------------------

function sanitizeHtml(html: string): string {
  let cleaned = html.trim()

  // Strip markdown code fences if Claude wrapped the output
  if (cleaned.startsWith("```html")) {
    cleaned = cleaned.slice("```html".length)
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice("```".length)
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -"```".length)
  }
  cleaned = cleaned.trim()

  // Strip full-document wrapper tags if Claude added them despite instructions
  cleaned = cleaned
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .trim()

  return cleaned
}

function validateFragment(fragment: Partial<DocFragment>): fragment is DocFragment {
  const required: (keyof DocFragment)[] = [
    "service",
    "docType",
    "entity",
    "html",
    "outputPath",
    "sourceRepo",
    "sourcePr",
    "generatedAt",
    "commitSha",
  ]

  for (const key of required) {
    if (!(key in fragment) || !fragment[key]) {
      console.warn(`Fragment missing required field: ${key}`)
      return false
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// Batched generation
// ---------------------------------------------------------------------------

async function batchGenerate<T>(
  items: T[],
  generator: (item: T) => Promise<DocFragment>,
): Promise<DocFragment[]> {
  const results: DocFragment[] = []

  for (let i = 0; i < items.length; i += MAX_CONCURRENCY) {
    const batch = items.slice(i, i + MAX_CONCURRENCY)
    const batchResults = await Promise.all(batch.map(generator))
    results.push(...batchResults)
  }

  return results
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasApiChanges(cs: StructuredChangeSet): boolean {
  return (
    cs.api.added.length > 0 ||
    cs.api.updated.length > 0 ||
    cs.api.removed.length > 0
  )
}

function hasModelChanges(cs: StructuredChangeSet): boolean {
  return (
    cs.models.added.length > 0 ||
    cs.models.updated.length > 0 ||
    cs.models.removed.length > 0
  )
}

function hasEventChanges(cs: StructuredChangeSet): boolean {
  return (
    cs.events.added.length > 0 ||
    cs.events.updated.length > 0 ||
    cs.events.removed.length > 0
  )
}

function findRelatedModels(
  route: RouteChange,
  cs: StructuredChangeSet,
): ModelChange[] {
  const allModels = [...cs.models.added, ...cs.models.updated]
  return allModels.filter(
    (m) => m.name === route.requestDto || m.name === route.responseDto,
  )
}

function makeSlug(method: string, path: string): string {
  return `${method.toLowerCase()}-${path.replace(/[/:]/g, "-").replace(/^-/, "").replace(/-+/g, "-")}`
}

function makeFragmentBase(
  docType: DocFragment["docType"],
  entity: string,
): Omit<DocFragment, "html" | "outputPath"> {
  return {
    service: changeSet.service,
    docType,
    entity,
    sourceRepo: changeSet.sourceRepo,
    sourcePr: changeSet.prNumber,
    generatedAt: new Date().toISOString(),
    commitSha: changeSet.headSha,
    hasBreakingChanges: false,
  }
}

// ---------------------------------------------------------------------------
// API doc generation
// ---------------------------------------------------------------------------

async function generateApiDocs(): Promise<DocFragment[]> {
  const allRoutes = [...changeSet.api.added, ...changeSet.api.updated]

  return batchGenerate(allRoutes, async (route) => {
    const html = await callClaudeWithRetry("api-docs.md", {
      service: changeSet.service,
      route,
      relatedModels: findRelatedModels(route, changeSet),
      isNew: changeSet.api.added.includes(route),
    })

    const slug = makeSlug(route.method, route.path)
    const entity = `${route.method} ${route.path}`

    const fragment: DocFragment = {
      ...makeFragmentBase("api", entity),
      html,
      outputPath: `${changeSet.service}/api/${slug}.html`,
    }

    return fragment
  })
}

// ---------------------------------------------------------------------------
// Model doc generation
// ---------------------------------------------------------------------------

async function generateModelDocs(): Promise<DocFragment[]> {
  type ModelWithChangeType = {
    model: ModelChange
    changeType: "added" | "updated" | "removed"
  }

  const items: ModelWithChangeType[] = [
    ...changeSet.models.added.map((m) => ({
      model: m,
      changeType: "added" as const,
    })),
    ...changeSet.models.updated.map((m) => ({
      model: m,
      changeType: "updated" as const,
    })),
    ...changeSet.models.removed.map((m) => ({
      model: m,
      changeType: "removed" as const,
    })),
  ]

  return batchGenerate(items, async ({ model, changeType }) => {
    const html = await callClaudeWithRetry("model-docs.md", {
      service: changeSet.service,
      model,
      isNew: changeType === "added",
      changeType,
    })

    const slug = model.name
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()

    const fragment: DocFragment = {
      ...makeFragmentBase("model", model.name),
      html,
      outputPath: `${changeSet.service}/models/${slug}.html`,
    }

    return fragment
  })
}

// ---------------------------------------------------------------------------
// Event doc generation
// ---------------------------------------------------------------------------

async function generateEventDocs(): Promise<DocFragment[]> {
  const allEvents = [
    ...changeSet.events.added,
    ...changeSet.events.updated,
  ]

  return batchGenerate(allEvents, async (event) => {
    // Try to find the payload model if the event references one
    const allModels = [...changeSet.models.added, ...changeSet.models.updated]
    const payloadModel = event.payload
      ? allModels.find((m) => m.name === event.payload) ?? null
      : null

    const html = await callClaudeWithRetry("event-docs.md", {
      service: changeSet.service,
      event,
      payloadModel,
      isNew: changeSet.events.added.includes(event),
    })

    const slug = event.name
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()

    const fragment: DocFragment = {
      ...makeFragmentBase("event", event.name),
      html,
      outputPath: `${changeSet.service}/events/${slug}.html`,
    }

    return fragment
  })
}

// ---------------------------------------------------------------------------
// Breaking change report generation
// ---------------------------------------------------------------------------

async function generateBreakingChangeReport(): Promise<DocFragment> {
  const html = await callClaudeWithRetry("breaking-change.md", {
    service: changeSet.service,
    prNumber: changeSet.prNumber,
    breakingChanges,
  })

  const fragment: DocFragment = {
    ...makeFragmentBase("breaking-change", `PR #${changeSet.prNumber} Breaking Changes`),
    hasBreakingChanges: true,
    html,
    outputPath: `${changeSet.service}/breaking-changes/pr-${changeSet.prNumber}.html`,
  }

  return fragment
}

// ---------------------------------------------------------------------------
// Flow doc generation (Phase 8)
// ---------------------------------------------------------------------------

function hasFlowData(cs: StructuredChangeSet): boolean {
  return !!(
    cs.frontendApiCalls &&
    (cs.frontendApiCalls.added.length > 0 || cs.frontendApiCalls.updated.length > 0) &&
    (cs.api.added.length > 0 || cs.api.updated.length > 0)
  )
}

async function generateFlowDocs(): Promise<DocFragment[]> {
  if (!changeSet.frontendApiCalls) return []

  const frontendCalls = [
    ...changeSet.frontendApiCalls.added,
    ...changeSet.frontendApiCalls.updated,
  ]
  const backendRoutes = [...changeSet.api.added, ...changeSet.api.updated]
  const backendEvents = [...changeSet.events.added, ...changeSet.events.updated]
  const allModels = [...changeSet.models.added, ...changeSet.models.updated]

  const flows = detectFlows(
    frontendCalls,
    backendRoutes,
    backendEvents,
    allModels,
    changeSet.service,
    changeSet.service,
  )

  if (flows.length === 0) return []

  return batchGenerate(flows, async (flow) => {
    const html = await callClaudeWithRetry("flow-docs.md", {
      flowName: flow.flowName,
      frontendCalls: [flow.frontendCall],
      backendRoutes: [flow.backendRoute],
      events: flow.events,
      models: [flow.requestDto, flow.responseDto].filter(Boolean),
    })

    const slug = flow.flowName
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase()

    const fragment: DocFragment = {
      ...makeFragmentBase("flow", flow.flowName),
      html,
      outputPath: `${changeSet.service}/flows/${slug}.html`,
    }

    return fragment
  })
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function generateDocs(): Promise<DocFragment[]> {
  const fragments: DocFragment[] = []

  if (hasApiChanges(changeSet)) {
    console.log("Generating API documentation...")
    const apiFragments = await generateApiDocs()
    fragments.push(...apiFragments)
    console.log(`  Generated ${apiFragments.length} API fragment(s)`)
  }

  if (hasModelChanges(changeSet)) {
    console.log("Generating model documentation...")
    const modelFragments = await generateModelDocs()
    fragments.push(...modelFragments)
    console.log(`  Generated ${modelFragments.length} model fragment(s)`)
  }

  if (hasEventChanges(changeSet)) {
    console.log("Generating event documentation...")
    const eventFragments = await generateEventDocs()
    fragments.push(...eventFragments)
    console.log(`  Generated ${eventFragments.length} event fragment(s)`)
  }

  if (breakingChanges.length > 0) {
    console.log("Generating breaking change report...")
    const breakingFragment = await generateBreakingChangeReport()
    fragments.push(breakingFragment)
    console.log("  Generated 1 breaking change report")
  }

  if (hasFlowData(changeSet)) {
    console.log("Generating flow documentation...")
    const flowFragments = await generateFlowDocs()
    fragments.push(...flowFragments)
    console.log(`  Generated ${flowFragments.length} flow fragment(s)`)
  }

  return fragments
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`Generating documentation for ${serviceName}...`)

const fragments = await generateDocs()

// Validate all fragments before writing
const validFragments = fragments.filter((f) => {
  const valid = validateFragment(f as Partial<DocFragment>)
  if (!valid) {
    console.warn(`Skipping invalid fragment: ${f.entity ?? "unknown"}`)
  }
  return valid
})

writeFileSync(
  "/tmp/docs-sync/fragments.json",
  JSON.stringify(validFragments, null, 2),
)

console.log(
  `Generated ${validFragments.length} documentation fragment(s) -> /tmp/docs-sync/fragments.json`,
)
