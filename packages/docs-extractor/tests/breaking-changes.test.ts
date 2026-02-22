import { describe, it, expect } from "vitest"
import { detectBreakingChanges } from "../src/breaking-changes.js"
import type { StructuredChangeSet } from "../src/types.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyChangeSet(overrides?: Partial<StructuredChangeSet>): StructuredChangeSet {
  return {
    service: "loan-api",
    sourceRepo: "test-org/loan-api",
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

// ---------------------------------------------------------------------------
// Empty changeset
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – no changes", () => {
  it("returns empty array for empty changeset", () => {
    const result = detectBreakingChanges(emptyChangeSet())
    expect(result).toHaveLength(0)
  })

  it("returns empty array when only additions exist", () => {
    const cs = emptyChangeSet({
      api: {
        added: [
          { method: "POST", path: "/loan/apply", sourceFile: "src/routes/loan.ts", sourceLine: 10 },
        ],
        updated: [],
        removed: [],
      },
      models: {
        added: [
          {
            name: "LoanApplicationDto",
            fields: [{ name: "amount", type: "number", optional: false }],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        updated: [],
        removed: [],
      },
      events: {
        added: [
          { name: "LoanCreatedEvent", payload: "LoanPayload", sourceFile: "src/events/loan.ts" },
        ],
        updated: [],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule 1: Route removed (critical)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – route removed", () => {
  it("detects a removed route as critical", () => {
    const cs = emptyChangeSet({
      api: {
        added: [],
        updated: [],
        removed: [
          { method: "GET", path: "/loan/status/:id", sourceFile: "src/routes/loan.ts", sourceLine: 5 },
        ],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("route-removed")
    expect(result[0].entity).toBe("GET /loan/status/:id")
    expect(result[0].severity).toBe("critical")
    expect(result[0].details).toContain("removed")
    expect(result[0].details).toContain("404")
  })

  it("detects multiple removed routes", () => {
    const cs = emptyChangeSet({
      api: {
        added: [],
        updated: [],
        removed: [
          { method: "GET", path: "/loan/status/:id", sourceFile: "src/routes/loan.ts", sourceLine: 5 },
          { method: "DELETE", path: "/loan/:id", sourceFile: "src/routes/loan.ts", sourceLine: 20 },
        ],
      },
    })

    const result = detectBreakingChanges(cs)
    const routeRemovals = result.filter((c) => c.type === "route-removed")
    expect(routeRemovals).toHaveLength(2)
  })

  it("does not flag added or updated routes", () => {
    const cs = emptyChangeSet({
      api: {
        added: [
          { method: "POST", path: "/loan/apply", sourceFile: "src/routes/loan.ts", sourceLine: 10 },
        ],
        updated: [
          { method: "PUT", path: "/loan/:id", requestDto: "UpdateLoanDto", sourceFile: "src/routes/loan.ts", sourceLine: 15 },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result.filter((c) => c.type === "route-removed")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule 2: Event removed (critical)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – event removed", () => {
  it("detects a removed event as critical", () => {
    const cs = emptyChangeSet({
      events: {
        added: [],
        updated: [],
        removed: [
          { name: "LoanCreatedEvent", payload: "LoanPayload", sourceFile: "src/events/loan.ts" },
        ],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("event-removed")
    expect(result[0].entity).toBe("LoanCreatedEvent")
    expect(result[0].severity).toBe("critical")
    expect(result[0].details).toContain("no longer published")
  })

  it("does not flag added or updated events", () => {
    const cs = emptyChangeSet({
      events: {
        added: [
          { name: "LoanApprovedEvent", sourceFile: "src/events/loan.ts" },
        ],
        updated: [
          { name: "LoanCreatedEvent", payload: "NewLoanPayload", sourceFile: "src/events/loan.ts" },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result.filter((c) => c.type === "event-removed")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule 3: Field type changed (critical)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – field type changed", () => {
  it("detects a field type change as critical", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "amount",
                type: "string",
                optional: false,
                previousType: "number",
                previousOptional: false,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("field-type-changed")
    expect(result[0].entity).toBe("LoanApplicationDto")
    expect(result[0].field).toBe("amount")
    expect(result[0].severity).toBe("critical")
    expect(result[0].details).toContain("number")
    expect(result[0].details).toContain("string")
  })

  it("does not flag fields where type is unchanged", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "amount",
                type: "number",
                optional: false,
                previousType: "number",
                previousOptional: true,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result.filter((c) => c.type === "field-type-changed")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule 4: Nullable to required (critical)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – nullable to required", () => {
  it("detects optional-to-required change as critical", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "middleName",
                type: "string",
                optional: false,
                previousType: "string",
                previousOptional: true,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    const nullToReq = result.filter((c) => c.type === "nullable-to-required")
    expect(nullToReq).toHaveLength(1)
    expect(nullToReq[0].entity).toBe("LoanApplicationDto")
    expect(nullToReq[0].field).toBe("middleName")
    expect(nullToReq[0].severity).toBe("critical")
  })

  it("does not flag required-to-optional change", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "middleName",
                type: "string",
                optional: true,
                previousType: "string",
                previousOptional: false,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result.filter((c) => c.type === "nullable-to-required")).toHaveLength(0)
  })

  it("does not flag field that was already required", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "amount",
                type: "string",
                optional: false,
                previousType: "number",
                previousOptional: false,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result.filter((c) => c.type === "nullable-to-required")).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Rule 5a: Entire model removed (critical)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – model removed", () => {
  it("detects an entirely removed model as critical field-removed", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [],
        removed: [
          {
            name: "OldDto",
            fields: [
              { name: "id", type: "string", optional: false },
              { name: "value", type: "number", optional: false },
            ],
            sourceFile: "src/dto/old.dto.ts",
          },
        ],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("field-removed")
    expect(result[0].entity).toBe("OldDto")
    expect(result[0].field).toBeUndefined()
    expect(result[0].severity).toBe("critical")
    expect(result[0].details).toContain("entirely removed")
  })
})

// ---------------------------------------------------------------------------
// Rule 5b: Individual field removed on updated model (critical)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – field removed on updated model", () => {
  it("detects a removed field (previousType set, type empty) as critical", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "employmentStatus",
                type: "",
                optional: false,
                previousType: "EmploymentStatus",
                previousOptional: false,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    const fieldRemovals = result.filter((c) => c.type === "field-removed")
    expect(fieldRemovals).toHaveLength(1)
    expect(fieldRemovals[0].entity).toBe("LoanApplicationDto")
    expect(fieldRemovals[0].field).toBe("employmentStatus")
    expect(fieldRemovals[0].severity).toBe("critical")
    expect(fieldRemovals[0].details).toContain("EmploymentStatus")
  })
})

// ---------------------------------------------------------------------------
// Rule 6: Required field added to existing model (warning)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – required field added", () => {
  it("detects a new required field on an updated model as warning", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "creditScore",
                type: "number",
                optional: false,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("required-field-added")
    expect(result[0].entity).toBe("LoanApplicationDto")
    expect(result[0].field).toBe("creditScore")
    expect(result[0].severity).toBe("warning")
    expect(result[0].details).toContain("number")
  })

  it("does not flag a new optional field", () => {
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              {
                name: "referralCode",
                type: "string",
                optional: true,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(0)
  })

  it("does not flag fields on newly added models", () => {
    const cs = emptyChangeSet({
      models: {
        added: [
          {
            name: "NewDto",
            fields: [
              { name: "id", type: "string", optional: false },
            ],
            sourceFile: "src/dto/new.dto.ts",
          },
        ],
        updated: [],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Sorting: critical before warning
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – sorting", () => {
  it("sorts critical changes before warnings", () => {
    const cs = emptyChangeSet({
      api: {
        added: [],
        updated: [],
        removed: [
          { method: "GET", path: "/loan/status/:id", sourceFile: "src/routes/loan.ts", sourceLine: 5 },
        ],
      },
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              // New required field (warning)
              { name: "creditScore", type: "number", optional: false },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)
    expect(result).toHaveLength(2)
    expect(result[0].severity).toBe("critical")
    expect(result[1].severity).toBe("warning")
  })
})

// ---------------------------------------------------------------------------
// Combined scenario (from phase doc example)
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – combined scenario", () => {
  it("detects multiple breaking changes from a complex changeset", () => {
    const cs = emptyChangeSet({
      api: {
        added: [],
        updated: [],
        removed: [
          { method: "GET", path: "/loan/employment-status/:id", sourceFile: "src/routes/loan.ts", sourceLine: 30 },
        ],
      },
      models: {
        added: [],
        updated: [
          {
            name: "LoanApplicationDto",
            fields: [
              // Removed field (previousType set, type empty)
              {
                name: "employmentStatus",
                type: "",
                optional: false,
                previousType: "EmploymentStatus",
                previousOptional: false,
              },
              // New required field
              {
                name: "creditScore",
                type: "number",
                optional: false,
              },
              // Type changed
              {
                name: "amount",
                type: "string",
                optional: false,
                previousType: "number",
                previousOptional: false,
              },
              // Optional to required
              {
                name: "middleName",
                type: "string",
                optional: false,
                previousType: "string",
                previousOptional: true,
              },
            ],
            sourceFile: "src/dto/loan.dto.ts",
          },
        ],
        removed: [],
      },
      events: {
        added: [],
        updated: [],
        removed: [
          { name: "LoanEmploymentCheckedEvent", sourceFile: "src/events/loan.ts" },
        ],
      },
    })

    const result = detectBreakingChanges(cs)

    // Count by type
    const routeRemoved = result.filter((c) => c.type === "route-removed")
    const eventRemoved = result.filter((c) => c.type === "event-removed")
    const fieldRemoved = result.filter((c) => c.type === "field-removed")
    const typeChanged = result.filter((c) => c.type === "field-type-changed")
    const nullToReq = result.filter((c) => c.type === "nullable-to-required")
    const reqAdded = result.filter((c) => c.type === "required-field-added")

    expect(routeRemoved).toHaveLength(1)
    expect(eventRemoved).toHaveLength(1)
    expect(fieldRemoved).toHaveLength(1)
    expect(typeChanged).toHaveLength(1)
    expect(nullToReq).toHaveLength(1)
    expect(reqAdded).toHaveLength(1)

    // Total: 6 breaking changes
    expect(result).toHaveLength(6)

    // All critical come before warning
    const criticalCount = result.filter((c) => c.severity === "critical").length
    expect(criticalCount).toBe(5)
    for (let i = 0; i < criticalCount; i++) {
      expect(result[i].severity).toBe("critical")
    }
    expect(result[criticalCount].severity).toBe("warning")
  })
})

// ---------------------------------------------------------------------------
// Integration with diffExtractions
// ---------------------------------------------------------------------------

describe("detectBreakingChanges – integration with differ output", () => {
  it("works with real differ output shape for removed fields", () => {
    // Simulate the exact shape the differ produces for a model
    // with one removed field, one new field, and one changed field
    const cs = emptyChangeSet({
      models: {
        added: [],
        updated: [
          {
            name: "UserDto",
            fields: [
              // Changed field (differ sets previousType/previousOptional)
              {
                name: "age",
                type: "string",
                optional: false,
                previousType: "number",
                previousOptional: false,
              },
              // New field (differ pushes head field as-is, no previousType)
              {
                name: "nickname",
                type: "string",
                optional: true,
              },
              // New required field
              {
                name: "phoneNumber",
                type: "string",
                optional: false,
              },
              // Removed field (differ sets previousType, type = "")
              {
                name: "legacyId",
                type: "",
                optional: false,
                previousType: "number",
                previousOptional: false,
              },
            ],
            sourceFile: "src/dto/user.dto.ts",
          },
        ],
        removed: [],
      },
    })

    const result = detectBreakingChanges(cs)

    // field-type-changed for "age" (number -> string)
    const typeChanged = result.find((c) => c.field === "age")
    expect(typeChanged).toBeDefined()
    expect(typeChanged!.type).toBe("field-type-changed")
    expect(typeChanged!.severity).toBe("critical")

    // field-removed for "legacyId"
    const fieldRemoved = result.find((c) => c.field === "legacyId")
    expect(fieldRemoved).toBeDefined()
    expect(fieldRemoved!.type).toBe("field-removed")
    expect(fieldRemoved!.severity).toBe("critical")

    // required-field-added for "phoneNumber"
    const reqAdded = result.find((c) => c.field === "phoneNumber")
    expect(reqAdded).toBeDefined()
    expect(reqAdded!.type).toBe("required-field-added")
    expect(reqAdded!.severity).toBe("warning")

    // "nickname" is optional new field — no breaking change
    expect(result.find((c) => c.field === "nickname")).toBeUndefined()

    expect(result).toHaveLength(3)
  })
})
