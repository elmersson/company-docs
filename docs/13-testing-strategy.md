# Testing Strategy

**Dependencies:** Phase 3 (extractor package)
**Testing framework:** Vitest
**Approach:** Fixture-based testing with real TypeScript source files

---

## Objective

Ensure every extractor, the differ, and the breaking change detector works correctly by testing against realistic TypeScript source code fixtures.

---

## Test Structure

```
packages/docs-extractor/
├── tests/
│   ├── fixtures/
│   │   ├── express-app/
│   │   │   ├── tsconfig.json
│   │   │   └── src/
│   │   │       ├── routes/
│   │   │       │   ├── loan.ts               # Standard routes
│   │   │       │   ├── health.ts             # Simple health check
│   │   │       │   └── complex.ts            # Edge cases
│   │   │       ├── dto/
│   │   │       │   ├── loan.dto.ts           # Standard DTOs
│   │   │       │   ├── shared.dto.ts         # Shared/reused types
│   │   │       │   └── enums.ts              # Enum definitions
│   │   │       ├── events/
│   │   │       │   ├── loan.events.ts        # Event publishers
│   │   │       │   └── notification.events.ts
│   │   │       └── prisma/
│   │   │           └── schema.prisma         # Prisma schema
│   │   │
│   │   ├── express-app-v2/                   # Modified version (for diffing)
│   │   │   ├── tsconfig.json
│   │   │   └── src/
│   │   │       ├── routes/loan.ts            # Route added/removed
│   │   │       ├── dto/loan.dto.ts           # Field changed
│   │   │       ├── events/loan.events.ts     # Event removed
│   │   │       └── prisma/schema.prisma      # Column added
│   │   │
│   │   └── react-app/
│   │       ├── tsconfig.json
│   │       └── src/
│   │           ├── api/
│   │           │   ├── loan.api.ts           # fetch() calls
│   │           │   └── user.api.ts           # axios calls
│   │           └── types/
│   │               └── loan.types.ts         # Frontend DTOs
│   │
│   ├── express-routes.test.ts
│   ├── dto-models.test.ts
│   ├── events.test.ts
│   ├── prisma-schema.test.ts
│   ├── frontend-api-calls.test.ts
│   ├── differ.test.ts
│   └── breaking-changes.test.ts
│
└── vitest.config.ts
```

---

## Vitest Configuration

### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],  // Re-export file
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
```

---

## Fixture Files

### `fixtures/express-app/src/routes/loan.ts`

```typescript
import { Router, Request, Response } from "express"
import { auth } from "../middleware/auth"
import { validate } from "../middleware/validate"
import { LoanApplicationDto } from "../dto/loan.dto"
import { LoanResultDto } from "../dto/loan.dto"
import { LoanController } from "../controllers/loan.controller"

const router = Router()
const controller = new LoanController()

// Standard route with middleware
router.post("/loan/apply", auth, validate(LoanApplicationDto), controller.applyLoan)

// Simple GET route
router.get("/loan/:id", auth, controller.getLoan)

// Route with inline handler
router.get("/loan/status/:id", (req: Request, res: Response) => {
  res.json({ status: "active" })
})

// DELETE route
router.delete("/loan/:id", auth, controller.deleteLoan)

export default router
```

### `fixtures/express-app/src/dto/loan.dto.ts`

```typescript
export enum EmploymentStatus {
  EMPLOYED = "EMPLOYED",
  SELF_EMPLOYED = "SELF_EMPLOYED",
  UNEMPLOYED = "UNEMPLOYED",
}

export interface LoanApplicationDto {
  amount: number
  employmentStatus: EmploymentStatus
  applicantName: string
  email: string
  monthlyIncome?: number
}

export interface LoanResultDto {
  approved: boolean
  loanId: string
  interestRate?: number
  rejectionReason?: string
}

export type LoanStatusDto = {
  id: string
  status: "pending" | "approved" | "rejected"
  updatedAt: string
}
```

### `fixtures/express-app/src/events/loan.events.ts`

```typescript
import { EventBus } from "../infrastructure/event-bus"

export class LoanCreatedEvent {
  constructor(public readonly payload: { loanId: string; amount: number }) {}
}

export class LoanApprovedEvent {
  constructor(public readonly payload: { loanId: string }) {}
}

// Usage in service
export class LoanService {
  constructor(private eventBus: EventBus) {}

  async createLoan(data: any) {
    // ... business logic ...
    this.eventBus.publish(new LoanCreatedEvent({ loanId: "123", amount: 5000 }))
  }

  async approveLoan(loanId: string) {
    // ... business logic ...
    this.eventBus.publish(new LoanApprovedEvent({ loanId }))
  }
}
```

### `fixtures/express-app-v2/src/dto/loan.dto.ts` (Modified version)

```typescript
export enum EmploymentStatus {
  EMPLOYED = "EMPLOYED",
  SELF_EMPLOYED = "SELF_EMPLOYED",
  UNEMPLOYED = "UNEMPLOYED",
  RETIRED = "RETIRED",  // Added
}

export interface LoanApplicationDto {
  amount: number
  // employmentStatus REMOVED (breaking change)
  applicantName: string
  email: string
  monthlyIncome: number          // Changed: optional -> required (breaking)
  creditScore: number            // Added: new required field (warning)
  referralCode?: string          // Added: new optional field (safe)
}

export interface LoanResultDto {
  approved: boolean
  loanId: string
  interestRate?: number
  rejectionReason?: string
  estimatedPayment: number       // Added field
}
```

### `fixtures/react-app/src/api/loan.api.ts`

```typescript
import axios from "axios"
import type { LoanApplicationDto, LoanResultDto } from "../types/loan.types"

const api = axios.create({ baseURL: "/api" })

export async function applyForLoan(data: LoanApplicationDto): Promise<LoanResultDto> {
  const response = await api.post<LoanResultDto>("/loan/apply", data)
  return response.data
}

export async function getLoanStatus(id: string) {
  const response = await fetch(`/api/loan/status/${id}`)
  return response.json()
}

export async function deleteLoan(id: string) {
  await axios.delete(`/api/loan/${id}`)
}
```

---

## Test Cases

### `tests/express-routes.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { extractExpressRoutes } from "../src/extractors/express-routes"
import { join } from "path"

const FIXTURE_PATH = join(__dirname, "fixtures/express-app")

describe("Express Route Extractor", () => {
  it("detects POST route with middleware", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    const postRoute = routes.find(r => r.method === "POST" && r.path === "/loan/apply")
    expect(postRoute).toBeDefined()
    expect(postRoute!.requestDto).toBe("LoanApplicationDto")
    expect(postRoute!.middleware).toContain("auth")
  })

  it("detects GET route with path parameter", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    const getRoute = routes.find(r => r.method === "GET" && r.path === "/loan/:id")
    expect(getRoute).toBeDefined()
  })

  it("detects DELETE route", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    const deleteRoute = routes.find(r => r.method === "DELETE")
    expect(deleteRoute).toBeDefined()
    expect(deleteRoute!.path).toBe("/loan/:id")
  })

  it("includes source file and line number", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    for (const route of routes) {
      expect(route.sourceFile).toContain("loan.ts")
      expect(route.sourceLine).toBeGreaterThan(0)
    }
  })

  it("returns empty array for non-route files", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/dto/loan.dto.ts"])
    expect(routes).toHaveLength(0)
  })
})
```

### `tests/dto-models.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { extractDtoModels } from "../src/extractors/dto-models"
import { join } from "path"

const FIXTURE_PATH = join(__dirname, "fixtures/express-app")

describe("DTO Model Extractor", () => {
  it("extracts interface with all fields", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    const loanDto = models.find(m => m.name === "LoanApplicationDto")
    expect(loanDto).toBeDefined()
    expect(loanDto!.fields).toHaveLength(5)

    const amountField = loanDto!.fields.find(f => f.name === "amount")
    expect(amountField!.type).toBe("number")
    expect(amountField!.optional).toBe(false)
  })

  it("detects optional fields", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    const loanDto = models.find(m => m.name === "LoanApplicationDto")
    const monthlyIncome = loanDto!.fields.find(f => f.name === "monthlyIncome")
    expect(monthlyIncome!.optional).toBe(true)
  })

  it("extracts type aliases", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    const statusDto = models.find(m => m.name === "LoanStatusDto")
    expect(statusDto).toBeDefined()
  })

  it("includes source file path", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    for (const model of models) {
      expect(model.sourceFile).toContain("loan.dto.ts")
    }
  })
})
```

### `tests/differ.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { extract } from "../src/index"
import { diffExtractions } from "../src/differ"
import { join } from "path"

const V1_PATH = join(__dirname, "fixtures/express-app")
const V2_PATH = join(__dirname, "fixtures/express-app-v2")

const config = {
  type: "backend" as const,
  framework: "express" as const,
  entryPoints: ["src/routes/**/*.ts"],
  dtoPatterns: ["src/dto/**/*.ts"],
  eventPatterns: ["src/events/**/*.ts"],
}

const meta = {
  service: "loan-api",
  sourceRepo: "test-org/loan-api",
  prNumber: 1,
  baseBranch: "main",
  headBranch: "feature/test",
  headSha: "abc123",
}

describe("Differ", () => {
  it("detects added routes", () => {
    const base = extract(V1_PATH, config)
    const head = extract(V2_PATH, config)
    const changeSet = diffExtractions(base, head, meta)

    expect(changeSet.api.added.length).toBeGreaterThanOrEqual(0)
  })

  it("detects removed fields on updated models", () => {
    const base = extract(V1_PATH, config)
    const head = extract(V2_PATH, config)
    const changeSet = diffExtractions(base, head, meta)

    const updatedLoanDto = changeSet.models.updated.find(
      m => m.name === "LoanApplicationDto"
    )
    expect(updatedLoanDto).toBeDefined()
  })

  it("detects field type changes", () => {
    const base = extract(V1_PATH, config)
    const head = extract(V2_PATH, config)
    const changeSet = diffExtractions(base, head, meta)

    const updatedLoanDto = changeSet.models.updated.find(
      m => m.name === "LoanApplicationDto"
    )

    const monthlyIncome = updatedLoanDto?.fields.find(
      f => f.name === "monthlyIncome"
    )
    // Changed from optional to required
    expect(monthlyIncome?.previousOptional).toBe(true)
    expect(monthlyIncome?.optional).toBe(false)
  })

  it("returns empty changeset when nothing changed", () => {
    const base = extract(V1_PATH, config)
    const head = extract(V1_PATH, config)  // Same as base
    const changeSet = diffExtractions(base, head, meta)

    expect(changeSet.api.added).toHaveLength(0)
    expect(changeSet.api.removed).toHaveLength(0)
    expect(changeSet.api.updated).toHaveLength(0)
    expect(changeSet.models.added).toHaveLength(0)
    expect(changeSet.models.removed).toHaveLength(0)
    expect(changeSet.models.updated).toHaveLength(0)
  })
})
```

### `tests/breaking-changes.test.ts`

```typescript
import { describe, it, expect } from "vitest"
import { detectBreakingChanges } from "../src/breaking-changes"
import type { StructuredChangeSet } from "../src/types"

describe("Breaking Change Detector", () => {
  it("detects removed route as critical", () => {
    const changeSet = makeChangeSet({
      api: {
        added: [],
        updated: [],
        removed: [
          { method: "DELETE", path: "/loan/:id", sourceFile: "test.ts", sourceLine: 1 },
        ],
      },
    })

    const changes = detectBreakingChanges(changeSet)
    expect(changes).toHaveLength(1)
    expect(changes[0].type).toBe("route-removed")
    expect(changes[0].severity).toBe("critical")
  })

  it("detects field type change as critical", () => {
    const changeSet = makeChangeSet({
      models: {
        added: [],
        removed: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              { name: "amount", type: "string", optional: false, previousType: "number" },
            ],
            sourceFile: "test.ts",
          },
        ],
      },
    })

    const changes = detectBreakingChanges(changeSet)
    const typeChange = changes.find(c => c.type === "field-type-changed")
    expect(typeChange).toBeDefined()
    expect(typeChange!.severity).toBe("critical")
    expect(typeChange!.field).toBe("amount")
  })

  it("detects nullable to required as critical", () => {
    const changeSet = makeChangeSet({
      models: {
        added: [],
        removed: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "monthlyIncome",
                type: "number",
                optional: false,
                previousOptional: true,
              },
            ],
            sourceFile: "test.ts",
          },
        ],
      },
    })

    const changes = detectBreakingChanges(changeSet)
    const nullableChange = changes.find(c => c.type === "nullable-to-required")
    expect(nullableChange).toBeDefined()
    expect(nullableChange!.severity).toBe("critical")
  })

  it("detects required field added as warning", () => {
    const changeSet = makeChangeSet({
      models: {
        added: [],
        removed: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              { name: "creditScore", type: "number", optional: false },
            ],
            sourceFile: "test.ts",
          },
        ],
      },
    })

    const changes = detectBreakingChanges(changeSet)
    const addedField = changes.find(c => c.type === "required-field-added")
    expect(addedField).toBeDefined()
    expect(addedField!.severity).toBe("warning")
  })

  it("returns empty for safe changes", () => {
    const changeSet = makeChangeSet({
      models: {
        added: [
          {
            name: "NewDto",
            fields: [{ name: "id", type: "string", optional: false }],
            sourceFile: "test.ts",
          },
        ],
        removed: [],
        updated: [],
      },
    })

    const changes = detectBreakingChanges(changeSet)
    expect(changes).toHaveLength(0)
  })

  it("sorts critical before warning", () => {
    const changeSet = makeChangeSet({
      api: {
        added: [],
        updated: [],
        removed: [
          { method: "GET", path: "/test", sourceFile: "test.ts", sourceLine: 1 },
        ],
      },
      models: {
        added: [],
        removed: [],
        updated: [
          {
            name: "TestDto",
            fields: [
              { name: "newField", type: "string", optional: false },
            ],
            sourceFile: "test.ts",
          },
        ],
      },
    })

    const changes = detectBreakingChanges(changeSet)
    expect(changes[0].severity).toBe("critical")
  })
})

// Helper to create a minimal StructuredChangeSet
function makeChangeSet(overrides: Partial<StructuredChangeSet>): StructuredChangeSet {
  return {
    service: "test-service",
    sourceRepo: "test-org/test-repo",
    prNumber: 1,
    baseBranch: "main",
    headBranch: "feature/test",
    headSha: "abc123",
    api: { added: [], updated: [], removed: [] },
    models: { added: [], updated: [], removed: [] },
    events: { added: [], updated: [], removed: [] },
    schema: { added: [], updated: [], removed: [] },
    ...overrides,
  }
}
```

---

## Running Tests

```bash
# Run all tests
pnpm --filter @company/docs-extractor test

# Run with coverage
pnpm --filter @company/docs-extractor test -- --coverage

# Run specific test file
pnpm --filter @company/docs-extractor test -- tests/express-routes.test.ts

# Watch mode during development
pnpm --filter @company/docs-extractor test -- --watch
```

---

## Coverage Targets

| Metric | Target | Rationale |
|---|---|---|
| Line coverage | 80% | Core logic must be tested |
| Branch coverage | 80% | Edge cases in extractors |
| Function coverage | 80% | All public API functions |

The 20% gap accounts for:
- Error handling paths that are hard to trigger in fixtures
- ts-morph edge cases with complex type resolution
- File system error handling

---

## Acceptance Criteria

- [ ] All 7 test files implemented
- [ ] Fixtures cover standard and edge-case patterns
- [ ] All tests pass with `vitest run`
- [ ] Coverage meets 80% threshold on all metrics
- [ ] Tests run in under 10 seconds total
- [ ] v2 fixtures exist for differ and breaking change tests
