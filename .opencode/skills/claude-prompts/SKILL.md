---
name: claude-prompts
description: Guide for writing and tuning Claude prompt templates that generate HTML documentation fragments from StructuredChangeSet data.
---

## What I do

Help write, debug, and tune the Claude prompt templates in `prompts/` that transform `StructuredChangeSet` data into `DocFragment[]` HTML output. Also covers the `generate.ts` script that orchestrates Claude API calls.

## Architecture

```
StructuredChangeSet.json
    |
    v
generate.ts
    |-- reads prompt from prompts/{type}.md
    |-- sends StructuredChangeSet section as JSON user message
    |-- system prompt = the prompt template
    |-- validates output
    v
DocFragment[] -> fragments.json
```

Claude runs inside the GitHub Action via `@anthropic-ai/sdk`. No separate service.

## Prompt template structure

Each prompt file in `prompts/` follows this pattern:

```markdown
You are a technical documentation generator for {domain}.
You generate clean, semantic HTML documentation fragments.

## Rules
1. Output ONLY an HTML fragment. No <html>, <head>, or <body> tags.
2. Use semantic HTML: <article>, <section>, <table>, <code>, <pre>.
3. {Domain-specific formatting rules}
4. Use CSS classes: {list of classes the Astro site expects}
5. Do NOT include any JavaScript.
6. Keep it concise. Developers read docs to find answers fast.

## Input Format
You will receive a JSON object with:
- {field descriptions}

## Output
A single HTML fragment documenting this {entity type}.
```

## Prompt files

| File | Input | Generates |
|---|---|---|
| `prompts/api-docs.md` | Single route + related models | API endpoint HTML |
| `prompts/model-docs.md` | Single model + change type | Data model HTML |
| `prompts/event-docs.md` | Single event + payload model | Domain event HTML |
| `prompts/flow-docs.md` | Flow steps + models + events | Cross-service flow HTML |
| `prompts/breaking-change.md` | BreakingChange[] array | Breaking change report HTML |

## Claude API call pattern

```typescript
import Anthropic from "@anthropic-ai/sdk"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 4096,
  system: readFileSync("prompts/api-docs.md", "utf-8"),
  messages: [{
    role: "user",
    content: JSON.stringify(data, null, 2),
  }],
})

const html = response.content.find(b => b.type === "text")?.text
```

## Output requirements

- HTML fragments only — no full document wrappers
- Semantic HTML: `<article>`, `<section>`, `<table>`, `<code>`, `<pre>`
- CSS classes must match what the Astro site expects:
  - `.endpoint-title`, `.method-badge`, `.method-get/post/put/patch/delete`
  - `.model-title`, `.field-table`, `.badge-changed`, `.badge-removed`
  - `.event-title`, `.event-payload`, `.event-trigger`
  - `.flow-title`, `.flow-steps`, `.flow-diagram`
  - `.breaking-report`, `.breaking-item`, `.severity-critical`, `.severity-warning`
- No JavaScript in output
- Generated HTML is written to `services/{service}/{docType}/{entity}.html`

## Error handling

```typescript
// Retry with exponential backoff
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    return await callClaude(prompt, data)
  } catch (error) {
    if (attempt === 3) throw error
    await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
  }
}

// Validate output
if (html.includes("<html") || html.includes("<body")) {
  // Strip wrapper tags — Claude occasionally wraps despite instructions
}
```

## Batching for large PRs

Process at most 5 concurrent Claude calls to avoid rate limits:

```typescript
for (let i = 0; i < items.length; i += 5) {
  const batch = items.slice(i, i + 5)
  const results = await Promise.all(batch.map(generator))
  fragments.push(...results)
}
```

## When to use me

Use this skill when writing or tuning prompt templates in `prompts/`, building the `generate.ts` script, or debugging Claude output quality issues.
