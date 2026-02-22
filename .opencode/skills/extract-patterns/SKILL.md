---
name: extract-patterns
description: Guide for writing ts-morph extractors that detect Express routes, DTOs, events, Prisma schemas, and frontend API calls from TypeScript source code.
---

## What I do

Help write and debug ts-morph extractors that perform static analysis on TypeScript codebases. Each extractor reads source files via the AST and outputs structured data conforming to the types in `contracts/StructuredChangeSet.ts`.

## ts-morph fundamentals

```typescript
import { Project, SyntaxKind } from "ts-morph"

// Create project from tsconfig
const project = new Project({
  tsConfigFilePath: `${projectPath}/tsconfig.json`,
})

// Get source files matching a glob
const files = project.getSourceFiles("src/routes/**/*.ts")

// Navigate the AST
const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
const interfaces = sourceFile.getInterfaces().filter(i => i.isExported())
const typeAliases = sourceFile.getTypeAliases().filter(t => t.isExported())
```

## Extractor patterns

### Express routes

Detect: `router.get/post(path, ...middleware, handler)` and `app.get/post(path, handler)`

```typescript
// Find call expressions where the callee is a property access with an HTTP method name
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"]

for (const call of calls) {
  const expr = call.getExpression()
  if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
    const methodName = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName()
    if (HTTP_METHODS.includes(methodName.toLowerCase())) {
      // First arg is the path (StringLiteral)
      // Last arg is the handler
      // Middle args are middleware
    }
  }
}
```

Output type: `RouteChange` from contracts.

### DTO models

Detect: exported `interface` and `type` declarations with object shapes.

```typescript
for (const iface of sourceFile.getInterfaces().filter(i => i.isExported())) {
  const fields = iface.getProperties().map(prop => ({
    name: prop.getName(),
    type: prop.getType().getText(),
    optional: prop.hasQuestionToken(),
  }))
}
```

Output type: `ModelChange` from contracts.

### Events

Detect: `*.publish(new XEvent())` and `*.emit("event-name", ...)`

```typescript
// Look for NewExpression inside publish/emit calls
if (firstArg.getKind() === SyntaxKind.NewExpression) {
  const className = firstArg.asKindOrThrow(SyntaxKind.NewExpression)
    .getExpression().getText()
}
```

Output type: `EventChange` from contracts.

### Frontend API calls

Detect: `fetch(url, opts)` and `axios.get/post(url)`

```typescript
// fetch: check if expression text is "fetch"
// axios: check if expression matches /\w+\.(get|post|put|patch|delete)$/
// Extract URL from first StringLiteral argument
// Extract method from options object or axios method name
```

Output type: `FrontendApiCall` from contracts.

### Prisma schema

Detect: `model X { ... }` blocks in `.prisma` files. Parsed with regex, not ts-morph.

```typescript
const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g
const fieldRegex = /^\s*(\w+)\s+(\w+[\[\]?]*)/gm
```

Output type: `TableChange` from contracts.

## Testing extractors

Every extractor must have fixture files in `packages/docs-extractor/tests/fixtures/`.

- `fixtures/express-app/` — a minimal Express project with tsconfig.json
- `fixtures/express-app-v2/` — modified version for differ tests
- `fixtures/react-app/` — a minimal React project with fetch/axios calls

Tests use Vitest:

```typescript
import { describe, it, expect } from "vitest"
const FIXTURE_PATH = join(__dirname, "fixtures/express-app")

it("detects POST route", () => {
  const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/**/*.ts"])
  expect(routes.find(r => r.method === "POST")).toBeDefined()
})
```

## Key rules

- Every extraction must include `sourceFile` and `sourceLine` for traceability
- All output must conform to types in `contracts/StructuredChangeSet.ts`
- Never execute source code — only static analysis
- Handle missing files gracefully (return empty arrays, don't throw)
- Use https://ts-ast-viewer.com to debug AST node types

## When to use me

Use this skill when writing, debugging, or extending any of the 5 extractors in `packages/docs-extractor/src/extractors/`. Also useful when adding support for new framework patterns (NestJS, Fastify, Angular, etc.).
