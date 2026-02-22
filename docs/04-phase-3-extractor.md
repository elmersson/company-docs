# Phase 3 - TypeScript Extractor Package

**Duration:** 5-7 days
**Dependencies:** Phase 1 (contracts), Phase 2 (differ)
**Outcome:** `@company/docs-extractor` package that extracts routes, DTOs, events, schemas, and frontend API calls using ts-morph

---

## Objective

Build an internal package that performs static analysis on TypeScript codebases to extract:

- Express.js routes (backend)
- DTOs / interfaces / types (backend + frontend)
- Events being published (backend)
- Prisma schema changes (backend)
- fetch/axios API calls (frontend)

The package uses `ts-morph` for AST analysis. It never executes the source code.

---

## Package Structure

```
packages/docs-extractor/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Public API: extract(projectPath, config)
│   ├── types.ts                    # ExtractionSnapshot + all subtypes
│   ├── extractors/
│   │   ├── express-routes.ts       # Express route extraction
│   │   ├── dto-models.ts           # Interface/type extraction
│   │   ├── events.ts               # Event publish detection
│   │   ├── prisma-schema.ts        # Prisma schema parsing
│   │   └── frontend-api-calls.ts   # fetch/axios detection
│   ├── differ.ts                   # From Phase 2
│   └── breaking-changes.ts         # From Phase 7
└── tests/
    ├── fixtures/
    │   ├── express-app/
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── routes/loan.ts
    │   │       ├── dto/loan.dto.ts
    │   │       └── events/loan.events.ts
    │   └── react-app/
    │       ├── tsconfig.json
    │       └── src/
    │           ├── api/loan.api.ts
    │           └── types/loan.types.ts
    ├── express-routes.test.ts
    ├── dto-models.test.ts
    ├── events.test.ts
    ├── prisma-schema.test.ts
    └── frontend-api-calls.test.ts
```

### `package.json`

```json
{
  "name": "@company/docs-extractor",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "ts-morph": "^22.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

---

## Extractor 1: Express Routes (`express-routes.ts`)

### Detection Patterns

The extractor detects these Express routing patterns:

```typescript
// Pattern 1: router.METHOD(path, handler)
router.post("/loan/apply", controller.applyLoan)

// Pattern 2: router.METHOD(path, ...middleware, handler)
router.post("/loan/apply", auth, validate(schema), controller.applyLoan)

// Pattern 3: app.METHOD(path, handler)
app.get("/health", (req, res) => res.json({ ok: true }))

// Pattern 4: Router chaining with .route()
router.route("/loan/:id")
  .get(controller.getLoan)
  .put(controller.updateLoan)

// Pattern 5: Mounted sub-routers
app.use("/api/v1/loans", loanRouter)
```

### Implementation Strategy

```typescript
import { Project, SyntaxKind, CallExpression } from "ts-morph"
import type { RouteChange } from "../types"

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const

export function extractExpressRoutes(projectPath: string, entryPoints: string[]): RouteChange[] {
  const project = new Project({
    tsConfigFilePath: `${projectPath}/tsconfig.json`,
  })

  const routes: RouteChange[] = []

  for (const pattern of entryPoints) {
    const sourceFiles = project.getSourceFiles(pattern)

    for (const sourceFile of sourceFiles) {
      // Find all call expressions
      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

      for (const call of callExpressions) {
        const route = tryParseRouteCall(call)
        if (route) {
          routes.push({
            ...route,
            sourceFile: sourceFile.getFilePath(),
            sourceLine: call.getStartLineNumber(),
          })
        }
      }
    }
  }

  return routes
}

function tryParseRouteCall(call: CallExpression): Partial<RouteChange> | null {
  const expression = call.getExpression()

  // Check for router.get(...), app.post(...), etc.
  if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propAccess = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
    const methodName = propAccess.getName().toLowerCase()

    if (HTTP_METHODS.includes(methodName as any)) {
      const args = call.getArguments()
      if (args.length === 0) return null

      const pathArg = args[0]
      const path = pathArg.getKind() === SyntaxKind.StringLiteral
        ? pathArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
        : null

      if (!path) return null

      // Try to resolve request/response DTOs from handler
      const handler = args[args.length - 1]
      const { requestDto, responseDto } = resolveHandlerTypes(handler)

      // Extract middleware names
      const middleware = args.slice(1, -1).map(arg => {
        // Get the identifier name of each middleware
        if (arg.getKind() === SyntaxKind.Identifier) {
          return arg.getText()
        }
        if (arg.getKind() === SyntaxKind.CallExpression) {
          return arg.asKindOrThrow(SyntaxKind.CallExpression)
            .getExpression().getText()
        }
        return "unknown"
      })

      return {
        method: methodName.toUpperCase() as RouteChange["method"],
        path,
        requestDto,
        responseDto,
        middleware: middleware.length > 0 ? middleware : undefined,
      }
    }
  }

  return null
}

function resolveHandlerTypes(handler: Node): {
  requestDto?: string
  responseDto?: string
} {
  // Strategy: look for type assertions, generic parameters, or
  // follow the handler reference to its function signature
  // ...implementation details...
  return {}
}
```

### Output Example

```json
{
  "method": "POST",
  "path": "/loan/apply",
  "requestDto": "LoanApplicationDto",
  "responseDto": "LoanResultDto",
  "middleware": ["auth", "validate"],
  "sourceFile": "src/routes/loan.ts",
  "sourceLine": 23
}
```

---

## Extractor 2: DTO Models (`dto-models.ts`)

### Detection Patterns

```typescript
// Pattern 1: Exported interface
export interface LoanApplicationDto {
  amount: number
  employmentStatus: EmploymentStatus
  applicantName: string
}

// Pattern 2: Exported type alias
export type LoanResultDto = {
  approved: boolean
  loanId: string
  interestRate?: number
}

// Pattern 3: Enum
export enum EmploymentStatus {
  EMPLOYED = "EMPLOYED",
  SELF_EMPLOYED = "SELF_EMPLOYED",
  UNEMPLOYED = "UNEMPLOYED",
}
```

### Implementation Strategy

```typescript
import { Project, SyntaxKind } from "ts-morph"
import type { ModelChange, FieldChange } from "../types"

export function extractDtoModels(projectPath: string, dtoPatterns: string[]): ModelChange[] {
  const project = new Project({
    tsConfigFilePath: `${projectPath}/tsconfig.json`,
  })

  const models: ModelChange[] = []

  for (const pattern of dtoPatterns) {
    const sourceFiles = project.getSourceFiles(pattern)

    for (const sourceFile of sourceFiles) {
      // Extract exported interfaces
      const interfaces = sourceFile.getInterfaces()
        .filter(i => i.isExported())

      for (const iface of interfaces) {
        models.push({
          name: iface.getName(),
          fields: iface.getProperties().map(prop => ({
            name: prop.getName(),
            type: prop.getType().getText(),
            optional: prop.hasQuestionToken(),
          })),
          sourceFile: sourceFile.getFilePath(),
        })
      }

      // Extract exported type aliases with object shapes
      const typeAliases = sourceFile.getTypeAliases()
        .filter(t => t.isExported())

      for (const typeAlias of typeAliases) {
        const type = typeAlias.getType()
        if (type.isObject()) {
          models.push({
            name: typeAlias.getName(),
            fields: type.getProperties().map(prop => ({
              name: prop.getName(),
              type: prop.getTypeAtLocation(sourceFile).getText(),
              optional: prop.isOptional(),
            })),
            sourceFile: sourceFile.getFilePath(),
          })
        }
      }
    }
  }

  return models
}
```

### Output Example

```json
{
  "name": "LoanApplicationDto",
  "fields": [
    { "name": "amount", "type": "number", "optional": false },
    { "name": "employmentStatus", "type": "EmploymentStatus", "optional": false },
    { "name": "applicantName", "type": "string", "optional": false }
  ],
  "sourceFile": "src/dto/loan.dto.ts"
}
```

---

## Extractor 3: Events (`events.ts`)

### Detection Patterns

```typescript
// Pattern 1: new EventClass() passed to publish/emit
this.eventBus.publish(new LoanCreatedEvent(payload))

// Pattern 2: emit with string event name
eventEmitter.emit("loan.created", payload)

// Pattern 3: Decorated event handlers (for detection of consumed events)
@EventHandler(LoanCreatedEvent)
handleLoanCreated(event: LoanCreatedEvent) { ... }
```

### Implementation Strategy

```typescript
import { Project, SyntaxKind } from "ts-morph"
import type { EventChange } from "../types"

export function extractEvents(projectPath: string, eventPatterns: string[]): EventChange[] {
  const project = new Project({
    tsConfigFilePath: `${projectPath}/tsconfig.json`,
  })

  const events: EventChange[] = []

  for (const pattern of eventPatterns) {
    const sourceFiles = project.getSourceFiles(pattern)

    for (const sourceFile of sourceFiles) {
      const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

      for (const call of callExpressions) {
        const text = call.getExpression().getText()

        // Detect publish/emit calls
        if (text.endsWith(".publish") || text.endsWith(".emit")) {
          const args = call.getArguments()
          if (args.length === 0) continue

          const firstArg = args[0]

          // Check for `new EventClass()`
          if (firstArg.getKind() === SyntaxKind.NewExpression) {
            const newExpr = firstArg.asKindOrThrow(SyntaxKind.NewExpression)
            const className = newExpr.getExpression().getText()

            events.push({
              name: className,
              payload: resolveEventPayload(newExpr),
              sourceFile: sourceFile.getFilePath(),
            })
          }

          // Check for string event name: emit("loan.created", ...)
          if (firstArg.getKind() === SyntaxKind.StringLiteral) {
            events.push({
              name: firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue(),
              channel: firstArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue(),
              sourceFile: sourceFile.getFilePath(),
            })
          }
        }
      }
    }
  }

  return events
}
```

---

## Extractor 4: Prisma Schema (`prisma-schema.ts`)

### Detection Strategy

Unlike the other extractors, Prisma schema is not TypeScript. We parse the `.prisma` file directly.

```typescript
import { readFileSync } from "fs"
import type { TableChange } from "../types"

/**
 * Parse a Prisma schema file and extract model definitions.
 * Returns table structures that can be diffed between base and head.
 */
export function extractPrismaSchema(schemaPath: string): TableChange[] {
  const content = readFileSync(schemaPath, "utf-8")
  const models = parsePrismaModels(content)

  return models.map(model => ({
    table: model.name,
    columns: {
      added: model.fields.map(f => ({ name: f.name, type: f.type })),
      removed: [],
      modified: [],
    },
  }))
}

type PrismaModel = {
  name: string
  fields: { name: string; type: string }[]
}

function parsePrismaModels(content: string): PrismaModel[] {
  const models: PrismaModel[] = []
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g

  let match
  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1]
    const body = match[2]

    const fields: { name: string; type: string }[] = []
    const fieldRegex = /^\s*(\w+)\s+(\w+[\[\]?]*)/gm

    let fieldMatch
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const fieldName = fieldMatch[1]
      const fieldType = fieldMatch[2]

      // Skip Prisma directives and relations
      if (["@@", "//"].some(p => fieldName.startsWith(p))) continue

      fields.push({ name: fieldName, type: fieldType })
    }

    models.push({ name, fields })
  }

  return models
}
```

### Input Example (schema.prisma)

```prisma
model LoanApplication {
  id                String   @id @default(uuid())
  amount            Float
  employmentStatus  String
  applicantName     String
  createdAt         DateTime @default(now())
}
```

### Output Example

```json
{
  "table": "LoanApplication",
  "columns": {
    "added": [
      { "name": "id", "type": "String" },
      { "name": "amount", "type": "Float" },
      { "name": "employmentStatus", "type": "String" },
      { "name": "applicantName", "type": "String" },
      { "name": "createdAt", "type": "DateTime" }
    ],
    "removed": [],
    "modified": []
  }
}
```

---

## Extractor 5: Frontend API Calls (`frontend-api-calls.ts`)

### Detection Patterns

```typescript
// Pattern 1: fetch()
const response = await fetch("/api/loan/apply", {
  method: "POST",
  body: JSON.stringify(data),
})

// Pattern 2: axios.METHOD()
const result = await axios.post<LoanResultDto>("/api/loan/apply", data)

// Pattern 3: axios instance
const api = axios.create({ baseURL: "/api" })
const result = await api.get<LoanDto[]>("/loans")

// Pattern 4: Custom wrapper
export async function applyForLoan(data: LoanApplicationDto): Promise<LoanResultDto> {
  return api.post("/loan/apply", data)
}
```

### Implementation Strategy

```typescript
import { Project, SyntaxKind } from "ts-morph"
import type { FrontendApiCall } from "../types"

export function extractFrontendApiCalls(
  projectPath: string,
  apiCallPatterns: string[]
): FrontendApiCall[] {
  const project = new Project({
    tsConfigFilePath: `${projectPath}/tsconfig.json`,
  })

  const apiCalls: FrontendApiCall[] = []

  for (const pattern of apiCallPatterns) {
    const sourceFiles = project.getSourceFiles(pattern)

    for (const sourceFile of sourceFiles) {
      const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

      for (const call of calls) {
        // Detect fetch() calls
        const fetchCall = tryParseFetchCall(call)
        if (fetchCall) {
          apiCalls.push({ ...fetchCall, sourceFile: sourceFile.getFilePath() })
          continue
        }

        // Detect axios calls
        const axiosCall = tryParseAxiosCall(call)
        if (axiosCall) {
          apiCalls.push({ ...axiosCall, sourceFile: sourceFile.getFilePath() })
        }
      }
    }
  }

  return apiCalls
}

function tryParseFetchCall(call: CallExpression): Partial<FrontendApiCall> | null {
  const expr = call.getExpression()
  if (expr.getText() !== "fetch") return null

  const args = call.getArguments()
  if (args.length === 0) return null

  const urlArg = args[0]
  const url = urlArg.getKind() === SyntaxKind.StringLiteral
    ? urlArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
    : null

  if (!url) return null

  // Extract method from options object
  let method = "GET"
  if (args.length > 1) {
    const options = args[1]
    if (options.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const methodProp = options
        .asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
        .getProperty("method")
      if (methodProp) {
        const init = methodProp.asKindOrThrow(SyntaxKind.PropertyAssignment)
          .getInitializer()
        if (init?.getKind() === SyntaxKind.StringLiteral) {
          method = init.asKindOrThrow(SyntaxKind.StringLiteral)
            .getLiteralValue().toUpperCase()
        }
      }
    }
  }

  return { url, method }
}

function tryParseAxiosCall(call: CallExpression): Partial<FrontendApiCall> | null {
  const expr = call.getExpression()
  const text = expr.getText()

  // Match axios.get, axios.post, api.get, etc.
  const axiosMethodMatch = text.match(/\w+\.(get|post|put|patch|delete)$/i)
  if (!axiosMethodMatch) return null

  const method = axiosMethodMatch[1].toUpperCase()
  const args = call.getArguments()
  if (args.length === 0) return null

  const urlArg = args[0]
  const url = urlArg.getKind() === SyntaxKind.StringLiteral
    ? urlArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
    : null

  if (!url) return null

  // Try to resolve generic type parameter (e.g. axios.post<ResponseDto>)
  const typeArgs = call.getTypeArguments()
  const responseDto = typeArgs.length > 0 ? typeArgs[0].getText() : undefined

  return { url, method, responseDto }
}
```

---

## Public API (`index.ts`)

```typescript
import { extractExpressRoutes } from "./extractors/express-routes"
import { extractDtoModels } from "./extractors/dto-models"
import { extractEvents } from "./extractors/events"
import { extractPrismaSchema } from "./extractors/prisma-schema"
import { extractFrontendApiCalls } from "./extractors/frontend-api-calls"
import { diffExtractions } from "./differ"
import { detectBreakingChanges } from "./breaking-changes"
import type { ExtractionSnapshot, StructuredChangeSet, BreakingChange } from "./types"

export type ExtractorConfig = {
  type: "backend" | "frontend"
  framework: "express" | "react"
  entryPoints?: string[]
  dtoPatterns?: string[]
  eventPatterns?: string[]
  prismaSchema?: string
  apiCallPatterns?: string[]
}

/**
 * Extract a full snapshot from a project directory.
 */
export function extract(projectPath: string, config: ExtractorConfig): ExtractionSnapshot {
  const routes = config.type === "backend" && config.entryPoints
    ? extractExpressRoutes(projectPath, config.entryPoints)
    : []

  const models = config.dtoPatterns
    ? extractDtoModels(projectPath, config.dtoPatterns)
    : []

  const events = config.type === "backend" && config.eventPatterns
    ? extractEvents(projectPath, config.eventPatterns)
    : []

  const tables = config.prismaSchema
    ? extractPrismaSchema(`${projectPath}/${config.prismaSchema}`)
    : []

  const apiCalls = config.type === "frontend" && config.apiCallPatterns
    ? extractFrontendApiCalls(projectPath, config.apiCallPatterns)
    : undefined

  return { routes, models, events, tables, apiCalls }
}

/**
 * Full pipeline: extract base + head, diff, detect breaking changes.
 */
export function extractAndDiff(
  basePath: string,
  headPath: string,
  config: ExtractorConfig,
  meta: {
    service: string
    sourceRepo: string
    prNumber: number
    baseBranch: string
    headBranch: string
    headSha: string
  }
): {
  changeSet: StructuredChangeSet
  breakingChanges: BreakingChange[]
} {
  const baseSnapshot = extract(basePath, config)
  const headSnapshot = extract(headPath, config)
  const changeSet = diffExtractions(baseSnapshot, headSnapshot, meta)
  const breakingChanges = detectBreakingChanges(changeSet)

  return { changeSet, breakingChanges }
}

// Re-export types
export * from "./types"
export { diffExtractions } from "./differ"
export { detectBreakingChanges } from "./breaking-changes"
```

---

## Limitations & Known Gaps

| Limitation | Impact | Future Work |
|---|---|---|
| Dynamic route paths (`/loan/${id}`) | Missed by string literal detection | Add template literal parsing |
| Re-exported types | May not be followed across files | Improve ts-morph type resolution |
| Axios instances with dynamic baseURL | URL may be partial | Cross-reference with env config |
| Non-Express frameworks | Not detected | Add NestJS, Fastify extractors later |
| Complex generic types | Displayed as raw text | Improve type simplification |

---

## Acceptance Criteria

- [ ] All 5 extractors implemented and tested
- [ ] Each extractor has at least 3 test cases using fixture files
- [ ] Public API (`extract`, `extractAndDiff`) works end-to-end
- [ ] Package builds cleanly with `tsc`
- [ ] All tests pass with `vitest run`
- [ ] Output conforms to `ExtractionSnapshot` and `StructuredChangeSet` types
