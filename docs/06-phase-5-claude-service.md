# Phase 5 - Claude Generation Service

**Duration:** 3-4 days
**Dependencies:** Phase 2 (StructuredChangeSet), Phase 4 (GitHub Action infrastructure)
**Outcome:** Claude generates DocFragment[] HTML from StructuredChangeSet, running inside the GitHub Action

---

## Objective

Build the Claude integration that transforms a `StructuredChangeSet` into `DocFragment[]` (HTML documentation). The LLM call runs directly inside the GitHub Action using the Anthropic TypeScript SDK. No separate service to deploy.

---

## Architecture

```
StructuredChangeSet.json
         |
         v
generate.ts (Action script)
         |
         |--- Read prompts from prompts/ directory
         |--- Chunk changeSet by doc type
         |--- Call Claude API for each chunk
         |--- Validate output against DocFragment schema
         |
         v
DocFragment[] --> fragments.json
```

---

## Implementation

### `scripts/generate.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk"
import { readFileSync, writeFileSync } from "fs"
import type { StructuredChangeSet, BreakingChange } from "@company/docs-extractor"
import type { DocFragment } from "../../../contracts/DocFragment"

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const changeSet: StructuredChangeSet = JSON.parse(
  readFileSync(process.env.CHANGESET_PATH!, "utf-8")
)

const breakingChanges: BreakingChange[] = JSON.parse(
  readFileSync(process.env.BREAKING_CHANGES_PATH!, "utf-8")
)

const serviceName = process.env.SERVICE_NAME!

async function generateDocs(): Promise<DocFragment[]> {
  const fragments: DocFragment[] = []

  // Generate API docs
  if (hasApiChanges(changeSet)) {
    const apiFragments = await generateApiDocs(changeSet)
    fragments.push(...apiFragments)
  }

  // Generate model docs
  if (hasModelChanges(changeSet)) {
    const modelFragments = await generateModelDocs(changeSet)
    fragments.push(...modelFragments)
  }

  // Generate event docs
  if (hasEventChanges(changeSet)) {
    const eventFragments = await generateEventDocs(changeSet)
    fragments.push(...eventFragments)
  }

  // Generate breaking change report
  if (breakingChanges.length > 0) {
    const breakingFragment = await generateBreakingChangeReport(
      changeSet, breakingChanges
    )
    fragments.push(breakingFragment)
  }

  return fragments
}

async function callClaude(
  promptFile: string,
  data: object
): Promise<string> {
  const systemPrompt = readFileSync(`prompts/${promptFile}`, "utf-8")

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

  const textBlock = response.content.find(block => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in Claude response")
  }

  return textBlock.text
}

async function generateApiDocs(
  changeSet: StructuredChangeSet
): Promise<DocFragment[]> {
  const allRoutes = [
    ...changeSet.api.added,
    ...changeSet.api.updated,
  ]

  const fragments: DocFragment[] = []

  for (const route of allRoutes) {
    const html = await callClaude("api-docs.md", {
      service: changeSet.service,
      route,
      relatedModels: findRelatedModels(route, changeSet),
      isNew: changeSet.api.added.includes(route),
    })

    const slug = `${route.method.toLowerCase()}-${route.path.replace(/[/:]/g, "-").replace(/^-/, "")}`

    fragments.push({
      service: changeSet.service,
      docType: "api",
      entity: `${route.method} ${route.path}`,
      sourceRepo: changeSet.sourceRepo,
      sourcePr: changeSet.prNumber,
      html,
      generatedAt: new Date().toISOString(),
      commitSha: changeSet.headSha,
      hasBreakingChanges: false,
      outputPath: `${changeSet.service}/api/${slug}.html`,
    })
  }

  return fragments
}

// Similar implementations for generateModelDocs, generateEventDocs,
// generateBreakingChangeReport...

// --- Helpers ---

function hasApiChanges(cs: StructuredChangeSet): boolean {
  return cs.api.added.length > 0 ||
    cs.api.updated.length > 0 ||
    cs.api.removed.length > 0
}

function hasModelChanges(cs: StructuredChangeSet): boolean {
  return cs.models.added.length > 0 ||
    cs.models.updated.length > 0 ||
    cs.models.removed.length > 0
}

function hasEventChanges(cs: StructuredChangeSet): boolean {
  return cs.events.added.length > 0 ||
    cs.events.updated.length > 0 ||
    cs.events.removed.length > 0
}

function findRelatedModels(route: RouteChange, cs: StructuredChangeSet) {
  const allModels = [
    ...cs.models.added,
    ...cs.models.updated,
  ]
  return allModels.filter(m =>
    m.name === route.requestDto || m.name === route.responseDto
  )
}

// --- Run ---
const fragments = await generateDocs()
writeFileSync("/tmp/docs-sync/fragments.json", JSON.stringify(fragments, null, 2))
console.log(`Generated ${fragments.length} documentation fragments`)
```

---

## Claude Prompt Templates

### `prompts/api-docs.md`

```markdown
You are a technical documentation generator for REST APIs. You generate clean,
semantic HTML documentation fragments.

## Rules

1. Output ONLY an HTML fragment. No <html>, <head>, or <body> tags.
2. Use semantic HTML: <article>, <section>, <table>, <code>, <pre>.
3. Include a clear title with the HTTP method and path.
4. Show request body structure as a table if a request DTO exists.
5. Show response body structure as a table if a response DTO exists.
6. Include example request/response JSON based on the field types.
7. If middleware is present, document authentication/validation requirements.
8. Mark new endpoints with a "New" badge.
9. Use CSS classes: .endpoint-title, .method-badge, .field-table, .example-block
10. Do NOT include any JavaScript.
11. Keep it concise. Developers read docs to find answers fast.

## Input Format

You will receive a JSON object with:
- service: the service name
- route: { method, path, requestDto, responseDto, middleware }
- relatedModels: full field definitions for request/response DTOs
- isNew: whether this is a newly added endpoint

## Output

A single HTML fragment documenting this API endpoint.
```

### `prompts/model-docs.md`

```markdown
You are a technical documentation generator for data models (DTOs/interfaces).
You generate clean, semantic HTML documentation fragments.

## Rules

1. Output ONLY an HTML fragment. No <html>, <head>, or <body> tags.
2. Use semantic HTML: <article>, <section>, <table>.
3. Show all fields in a table with columns: Field, Type, Required, Description.
4. For updated models, highlight changed fields with a "Changed" badge.
5. For updated models, show the previous type if a field type changed.
6. If a field was removed, show it with strikethrough and a "Removed" badge.
7. Generate brief descriptions for each field based on its name and type.
8. Use CSS classes: .model-title, .field-table, .badge-changed, .badge-removed
9. Do NOT include any JavaScript.

## Input Format

You will receive a JSON object with:
- service: the service name
- model: { name, fields: [{ name, type, optional, previousType? }] }
- isNew: whether this is a newly added model
- changeType: "added" | "updated" | "removed"

## Output

A single HTML fragment documenting this data model.
```

### `prompts/event-docs.md`

```markdown
You are a technical documentation generator for domain events.
You generate clean, semantic HTML documentation fragments.

## Rules

1. Output ONLY an HTML fragment. No <html>, <head>, or <body> tags.
2. Use semantic HTML: <article>, <section>.
3. Document the event name, when it is published, and its payload structure.
4. If a payload DTO is specified, show its fields.
5. Include a "When is this event published?" section with a brief explanation
   derived from the event name (e.g. LoanCreatedEvent -> "Published when a new
   loan application is created").
6. Use CSS classes: .event-title, .event-payload, .event-trigger
7. Do NOT include any JavaScript.

## Input Format

You will receive a JSON object with:
- service: the service name
- event: { name, payload, channel }
- payloadModel: full field definitions if payload DTO was found
- isNew: whether this is a newly added event

## Output

A single HTML fragment documenting this domain event.
```

### `prompts/breaking-change.md`

```markdown
You are a technical documentation generator for breaking change reports.
You generate clear, actionable HTML documentation.

## Rules

1. Output ONLY an HTML fragment. No <html>, <head>, or <body> tags.
2. Use semantic HTML with clear severity indicators.
3. For each breaking change, explain:
   - WHAT changed
   - WHY it's breaking
   - WHO is affected (list affected consumer repos if known)
   - WHAT to do about it (migration guidance)
4. Use severity colors: critical = red, warning = orange.
5. Order changes by severity (critical first).
6. Use CSS classes: .breaking-report, .breaking-item, .severity-critical,
   .severity-warning, .migration-guide
7. Do NOT include any JavaScript.

## Input Format

You will receive a JSON object with:
- service: the service name
- prNumber: the PR that introduced these changes
- breakingChanges: array of { type, entity, field, details, severity, affectedConsumers }

## Output

A single HTML fragment documenting all breaking changes in this PR.
```

### `prompts/flow-docs.md`

```markdown
You are a technical documentation generator for cross-service flows.
You generate clear visual flow documentation in HTML.

## Rules

1. Output ONLY an HTML fragment. No <html>, <head>, or <body> tags.
2. Document the end-to-end flow: which frontend calls which backend endpoint,
   what events are emitted, what data flows between services.
3. Use an ordered list or step-by-step format to show the flow.
4. Include a simple ASCII or table-based flow diagram.
5. Reference the specific endpoints, DTOs, and events involved.
6. Use CSS classes: .flow-title, .flow-steps, .flow-diagram
7. Do NOT include any JavaScript.

## Input Format

You will receive a JSON object with:
- flowName: name of the flow
- frontendCalls: API calls made by the frontend
- backendRoutes: corresponding backend routes
- events: events emitted during the flow
- models: DTOs involved in the flow

## Output

A single HTML fragment documenting this cross-service flow.
```

---

## Error Handling & Resilience

### Retry Logic

```typescript
async function callClaudeWithRetry(
  promptFile: string,
  data: object,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await callClaude(promptFile, data)
    } catch (error) {
      if (attempt === maxRetries) throw error

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000
      console.log(`Claude API call failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error("Unreachable")
}
```

### Output Validation

```typescript
function validateFragment(fragment: Partial<DocFragment>): fragment is DocFragment {
  const required = ["service", "docType", "entity", "html", "outputPath"]
  for (const key of required) {
    if (!(key in fragment) || !fragment[key as keyof DocFragment]) {
      console.warn(`Fragment missing required field: ${key}`)
      return false
    }
  }

  // Validate HTML is a fragment (no full document tags)
  if (fragment.html?.includes("<html") || fragment.html?.includes("<body")) {
    console.warn("Fragment contains full HTML document tags. Stripping...")
    // Strip wrapper tags
  }

  return true
}
```

### Rate Limiting

For large PRs with many changes, batch Claude calls:

```typescript
// Process at most 5 concurrent Claude calls
async function batchGenerate<T>(
  items: T[],
  generator: (item: T) => Promise<DocFragment>,
  concurrency: number = 5
): Promise<DocFragment[]> {
  const results: DocFragment[] = []

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(generator))
    results.push(...batchResults)
  }

  return results
}
```

---

## Cost Estimation

| Scenario | Input Tokens | Output Tokens | Est. Cost |
|---|---|---|---|
| Small PR (1 route, 1 model) | ~1,000 | ~2,000 | ~$0.01 |
| Medium PR (3 routes, 5 models) | ~3,000 | ~8,000 | ~$0.04 |
| Large PR (10 routes, 15 models, events) | ~10,000 | ~25,000 | ~$0.12 |

Using claude-sonnet-4-20250514 pricing. Monthly cost for a team doing ~100 PRs/month: **~$5-15/month**.

---

## Acceptance Criteria

- [ ] `generate.ts` script implemented
- [ ] All 5 prompt templates created in `prompts/`
- [ ] Claude calls include retry logic with exponential backoff
- [ ] Output validated against DocFragment schema
- [ ] HTML output is clean fragments (no full document wrappers)
- [ ] Large PRs handled via batching (max 5 concurrent calls)
- [ ] Total Claude cost per PR under $0.20
