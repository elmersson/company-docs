import { describe, it, expect } from "vitest"
import { diffExtractions } from "../src/differ.js"
import type { ExtractionSnapshot } from "../src/types.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const meta = {
  service: "loan-api",
  sourceRepo: "test-org/loan-api",
  prNumber: 1,
  baseBranch: "main",
  headBranch: "feature/test",
  headSha: "abc123",
}

function emptySnapshot(): ExtractionSnapshot {
  return {
    routes: [],
    models: [],
    events: [],
    tables: [],
  }
}

// ---------------------------------------------------------------------------
// Empty changeset
// ---------------------------------------------------------------------------

describe("diffExtractions – empty changeset", () => {
  it("returns empty diff when base and head are identical", () => {
    const snapshot = emptySnapshot()
    const result = diffExtractions(snapshot, snapshot, meta)

    expect(result.api.added).toHaveLength(0)
    expect(result.api.updated).toHaveLength(0)
    expect(result.api.removed).toHaveLength(0)
    expect(result.models.added).toHaveLength(0)
    expect(result.models.updated).toHaveLength(0)
    expect(result.models.removed).toHaveLength(0)
    expect(result.events.added).toHaveLength(0)
    expect(result.events.updated).toHaveLength(0)
    expect(result.events.removed).toHaveLength(0)
    expect(result.schema.added).toHaveLength(0)
    expect(result.schema.updated).toHaveLength(0)
    expect(result.schema.removed).toHaveLength(0)
    expect(result.frontendApiCalls).toBeUndefined()
  })

  it("returns empty diff when both snapshots have the same data", () => {
    const snapshot: ExtractionSnapshot = {
      routes: [
        {
          method: "POST",
          path: "/loan/apply",
          requestDto: "LoanApplicationDto",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 10,
        },
      ],
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
            { name: "email", type: "string", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
      events: [
        { name: "LoanCreatedEvent", payload: "LoanPayload", sourceFile: "src/events/loan.ts" },
      ],
      tables: [],
    }

    const result = diffExtractions(snapshot, snapshot, meta)

    expect(result.api.added).toHaveLength(0)
    expect(result.api.updated).toHaveLength(0)
    expect(result.api.removed).toHaveLength(0)
    expect(result.models.added).toHaveLength(0)
    expect(result.models.updated).toHaveLength(0)
    expect(result.models.removed).toHaveLength(0)
    expect(result.events.added).toHaveLength(0)
    expect(result.events.updated).toHaveLength(0)
    expect(result.events.removed).toHaveLength(0)
  })

  it("preserves meta fields in output", () => {
    const result = diffExtractions(emptySnapshot(), emptySnapshot(), meta)

    expect(result.service).toBe("loan-api")
    expect(result.sourceRepo).toBe("test-org/loan-api")
    expect(result.prNumber).toBe(1)
    expect(result.baseBranch).toBe("main")
    expect(result.headBranch).toBe("feature/test")
    expect(result.headSha).toBe("abc123")
  })
})

// ---------------------------------------------------------------------------
// Route diffing
// ---------------------------------------------------------------------------

describe("diffExtractions – routes", () => {
  it("detects added routes", () => {
    const base = emptySnapshot()
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "GET",
          path: "/loan/:id",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 5,
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.api.added).toHaveLength(1)
    expect(result.api.added[0].method).toBe("GET")
    expect(result.api.added[0].path).toBe("/loan/:id")
    expect(result.api.removed).toHaveLength(0)
    expect(result.api.updated).toHaveLength(0)
  })

  it("detects removed routes", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "DELETE",
          path: "/loan/:id",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 20,
        },
      ],
    }
    const head = emptySnapshot()

    const result = diffExtractions(base, head, meta)

    expect(result.api.removed).toHaveLength(1)
    expect(result.api.removed[0].method).toBe("DELETE")
    expect(result.api.removed[0].path).toBe("/loan/:id")
    expect(result.api.added).toHaveLength(0)
  })

  it("detects updated routes (requestDto changed)", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "POST",
          path: "/loan/apply",
          requestDto: "LoanApplicationDto",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 10,
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "POST",
          path: "/loan/apply",
          requestDto: "LoanApplicationDtoV2",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 10,
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.api.updated).toHaveLength(1)
    expect(result.api.updated[0].requestDto).toBe("LoanApplicationDtoV2")
    expect(result.api.added).toHaveLength(0)
    expect(result.api.removed).toHaveLength(0)
  })

  it("detects updated routes (responseDto changed)", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "GET",
          path: "/loan/:id",
          responseDto: "LoanDto",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 5,
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "GET",
          path: "/loan/:id",
          responseDto: "LoanDetailDto",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 5,
        },
      ],
    }

    const result = diffExtractions(base, head, meta)
    expect(result.api.updated).toHaveLength(1)
    expect(result.api.updated[0].responseDto).toBe("LoanDetailDto")
  })

  it("treats route rename as removal + addition", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "GET",
          path: "/loan/status/:id",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 15,
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      routes: [
        {
          method: "GET",
          path: "/loan/state/:id",
          sourceFile: "src/routes/loan.ts",
          sourceLine: 15,
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.api.removed).toHaveLength(1)
    expect(result.api.removed[0].path).toBe("/loan/status/:id")
    expect(result.api.added).toHaveLength(1)
    expect(result.api.added[0].path).toBe("/loan/state/:id")
    expect(result.api.updated).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Model diffing
// ---------------------------------------------------------------------------

describe("diffExtractions – models", () => {
  it("detects added models", () => {
    const base = emptySnapshot()
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "NewDto",
          fields: [{ name: "id", type: "string", optional: false }],
          sourceFile: "src/dto/new.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.models.added).toHaveLength(1)
    expect(result.models.added[0].name).toBe("NewDto")
    expect(result.models.removed).toHaveLength(0)
    expect(result.models.updated).toHaveLength(0)
  })

  it("detects removed models", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "OldDto",
          fields: [{ name: "id", type: "string", optional: false }],
          sourceFile: "src/dto/old.dto.ts",
        },
      ],
    }
    const head = emptySnapshot()

    const result = diffExtractions(base, head, meta)

    expect(result.models.removed).toHaveLength(1)
    expect(result.models.removed[0].name).toBe("OldDto")
    expect(result.models.added).toHaveLength(0)
  })

  it("detects new fields on an existing model", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
            { name: "email", type: "string", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
            { name: "email", type: "string", optional: false },
            { name: "creditScore", type: "number", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.models.updated).toHaveLength(1)
    const updated = result.models.updated[0]
    expect(updated.name).toBe("LoanApplicationDto")
    // Only the new field should appear in the diff
    expect(updated.fields).toHaveLength(1)
    expect(updated.fields[0].name).toBe("creditScore")
    expect(updated.fields[0].previousType).toBeUndefined()
  })

  it("detects removed fields on an existing model", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
            { name: "employmentStatus", type: "EmploymentStatus", optional: false },
            { name: "email", type: "string", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
            { name: "email", type: "string", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.models.updated).toHaveLength(1)
    const updated = result.models.updated[0]
    const removedField = updated.fields.find((f) => f.name === "employmentStatus")
    expect(removedField).toBeDefined()
    expect(removedField!.type).toBe("EmploymentStatus")
  })

  it("detects field type changes with previousType", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "string", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.models.updated).toHaveLength(1)
    const field = result.models.updated[0].fields[0]
    expect(field.name).toBe("amount")
    expect(field.type).toBe("string")
    expect(field.previousType).toBe("number")
  })

  it("detects optional-to-required change with previousOptional", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "monthlyIncome", type: "number", optional: true },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "monthlyIncome", type: "number", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.models.updated).toHaveLength(1)
    const field = result.models.updated[0].fields[0]
    expect(field.name).toBe("monthlyIncome")
    expect(field.optional).toBe(false)
    expect(field.previousOptional).toBe(true)
    expect(field.previousType).toBe("number")
  })

  it("does not report unchanged models", () => {
    const snapshot: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }

    const result = diffExtractions(snapshot, snapshot, meta)
    expect(result.models.updated).toHaveLength(0)
  })

  it("does not treat field reorder as a change", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
            { name: "email", type: "string", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "email", type: "string", optional: false },
            { name: "amount", type: "number", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)
    expect(result.models.updated).toHaveLength(0)
  })

  it("treats model rename as removal + addition", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "OldDto",
          fields: [{ name: "id", type: "string", optional: false }],
          sourceFile: "src/dto/old.dto.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "NewDto",
          fields: [{ name: "id", type: "string", optional: false }],
          sourceFile: "src/dto/new.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.models.removed).toHaveLength(1)
    expect(result.models.removed[0].name).toBe("OldDto")
    expect(result.models.added).toHaveLength(1)
    expect(result.models.added[0].name).toBe("NewDto")
    expect(result.models.updated).toHaveLength(0)
  })

  it("handles combined field additions, removals, and changes", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false },
            { name: "employmentStatus", type: "EmploymentStatus", optional: false },
            { name: "monthlyIncome", type: "number", optional: true },
            { name: "email", type: "string", optional: false },
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      models: [
        {
          name: "LoanApplicationDto",
          fields: [
            { name: "amount", type: "number", optional: false }, // unchanged
            // employmentStatus removed
            { name: "monthlyIncome", type: "number", optional: false }, // optional -> required
            { name: "email", type: "string", optional: false }, // unchanged
            { name: "creditScore", type: "number", optional: false }, // new
            { name: "referralCode", type: "string", optional: true }, // new
          ],
          sourceFile: "src/dto/loan.dto.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.models.updated).toHaveLength(1)
    const updated = result.models.updated[0]
    expect(updated.name).toBe("LoanApplicationDto")

    const fieldNames = updated.fields.map((f) => f.name)
    // changed fields: monthlyIncome (optional->required), creditScore (new), referralCode (new), employmentStatus (removed)
    expect(fieldNames).toContain("monthlyIncome")
    expect(fieldNames).toContain("creditScore")
    expect(fieldNames).toContain("referralCode")
    expect(fieldNames).toContain("employmentStatus")

    // monthlyIncome should have previousOptional
    const monthlyIncome = updated.fields.find((f) => f.name === "monthlyIncome")
    expect(monthlyIncome!.previousOptional).toBe(true)
    expect(monthlyIncome!.optional).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Event diffing
// ---------------------------------------------------------------------------

describe("diffExtractions – events", () => {
  it("detects added events", () => {
    const base = emptySnapshot()
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      events: [
        { name: "LoanCreatedEvent", payload: "LoanPayload", sourceFile: "src/events/loan.ts" },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.events.added).toHaveLength(1)
    expect(result.events.added[0].name).toBe("LoanCreatedEvent")
  })

  it("detects removed events", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      events: [
        { name: "LoanApprovedEvent", sourceFile: "src/events/loan.ts" },
      ],
    }
    const head = emptySnapshot()

    const result = diffExtractions(base, head, meta)

    expect(result.events.removed).toHaveLength(1)
    expect(result.events.removed[0].name).toBe("LoanApprovedEvent")
  })

  it("detects updated events (payload changed)", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      events: [
        { name: "LoanCreatedEvent", payload: "LoanPayload", sourceFile: "src/events/loan.ts" },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      events: [
        { name: "LoanCreatedEvent", payload: "LoanPayloadV2", sourceFile: "src/events/loan.ts" },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.events.updated).toHaveLength(1)
    expect(result.events.updated[0].payload).toBe("LoanPayloadV2")
  })

  it("detects updated events (channel changed)", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      events: [
        { name: "LoanCreatedEvent", channel: "loans", sourceFile: "src/events/loan.ts" },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      events: [
        { name: "LoanCreatedEvent", channel: "loan-events", sourceFile: "src/events/loan.ts" },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.events.updated).toHaveLength(1)
    expect(result.events.updated[0].channel).toBe("loan-events")
  })
})

// ---------------------------------------------------------------------------
// Table / schema diffing
// ---------------------------------------------------------------------------

describe("diffExtractions – schema (tables)", () => {
  it("detects added tables", () => {
    const base = emptySnapshot()
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [
              { name: "id", type: "String" },
              { name: "amount", type: "Float" },
            ],
            removed: [],
            modified: [],
          },
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.schema.added).toHaveLength(1)
    expect(result.schema.added[0].table).toBe("LoanApplication")
  })

  it("detects removed tables", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "OldTable",
          columns: {
            added: [{ name: "id", type: "String" }],
            removed: [],
            modified: [],
          },
        },
      ],
    }
    const head = emptySnapshot()

    const result = diffExtractions(base, head, meta)

    expect(result.schema.removed).toHaveLength(1)
    expect(result.schema.removed[0].table).toBe("OldTable")
  })

  it("detects column additions within a table", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [
              { name: "id", type: "String" },
              { name: "amount", type: "Float" },
            ],
            removed: [],
            modified: [],
          },
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [
              { name: "id", type: "String" },
              { name: "amount", type: "Float" },
              { name: "employmentStatus", type: "String" },
            ],
            removed: [],
            modified: [],
          },
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.schema.updated).toHaveLength(1)
    const updated = result.schema.updated[0]
    expect(updated.table).toBe("LoanApplication")
    expect(updated.columns.added).toHaveLength(1)
    expect(updated.columns.added[0].name).toBe("employmentStatus")
    expect(updated.columns.removed).toHaveLength(0)
    expect(updated.columns.modified).toHaveLength(0)
  })

  it("detects column removals within a table", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [
              { name: "id", type: "String" },
              { name: "amount", type: "Float" },
              { name: "legacyField", type: "String" },
            ],
            removed: [],
            modified: [],
          },
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [
              { name: "id", type: "String" },
              { name: "amount", type: "Float" },
            ],
            removed: [],
            modified: [],
          },
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.schema.updated).toHaveLength(1)
    expect(result.schema.updated[0].columns.removed).toHaveLength(1)
    expect(result.schema.updated[0].columns.removed[0].name).toBe("legacyField")
  })

  it("detects column type modifications within a table", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [
              { name: "id", type: "String" },
              { name: "amount", type: "Int" },
            ],
            removed: [],
            modified: [],
          },
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [
              { name: "id", type: "String" },
              { name: "amount", type: "Float" },
            ],
            removed: [],
            modified: [],
          },
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.schema.updated).toHaveLength(1)
    expect(result.schema.updated[0].columns.modified).toHaveLength(1)
    expect(result.schema.updated[0].columns.modified[0]).toEqual({
      name: "amount",
      from: "Int",
      to: "Float",
    })
  })

  it("does not report unchanged tables", () => {
    const snapshot: ExtractionSnapshot = {
      ...emptySnapshot(),
      tables: [
        {
          table: "LoanApplication",
          columns: {
            added: [{ name: "id", type: "String" }],
            removed: [],
            modified: [],
          },
        },
      ],
    }

    const result = diffExtractions(snapshot, snapshot, meta)
    expect(result.schema.updated).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Frontend API call diffing
// ---------------------------------------------------------------------------

describe("diffExtractions – frontendApiCalls", () => {
  it("returns undefined when neither snapshot has apiCalls", () => {
    const result = diffExtractions(emptySnapshot(), emptySnapshot(), meta)
    expect(result.frontendApiCalls).toBeUndefined()
  })

  it("detects added API calls", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [
        {
          method: "POST",
          url: "/api/loan/apply",
          requestDto: "LoanApplicationDto",
          sourceFile: "src/api/loan.api.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.frontendApiCalls).toBeDefined()
    expect(result.frontendApiCalls!.added).toHaveLength(1)
    expect(result.frontendApiCalls!.added[0].url).toBe("/api/loan/apply")
  })

  it("detects removed API calls", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [
        {
          method: "DELETE",
          url: "/api/loan/:id",
          sourceFile: "src/api/loan.api.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.frontendApiCalls).toBeDefined()
    expect(result.frontendApiCalls!.removed).toHaveLength(1)
    expect(result.frontendApiCalls!.removed[0].url).toBe("/api/loan/:id")
  })

  it("detects updated API calls (requestDto changed)", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [
        {
          method: "POST",
          url: "/api/loan/apply",
          requestDto: "LoanApplicationDto",
          sourceFile: "src/api/loan.api.ts",
        },
      ],
    }
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [
        {
          method: "POST",
          url: "/api/loan/apply",
          requestDto: "LoanApplicationDtoV2",
          sourceFile: "src/api/loan.api.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.frontendApiCalls).toBeDefined()
    expect(result.frontendApiCalls!.updated).toHaveLength(1)
    expect(result.frontendApiCalls!.updated[0].requestDto).toBe("LoanApplicationDtoV2")
  })

  it("populates frontendApiCalls when only head has apiCalls", () => {
    const base = emptySnapshot() // no apiCalls field
    const head: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [
        {
          method: "GET",
          url: "/api/loan/status/:id",
          sourceFile: "src/api/loan.api.ts",
        },
      ],
    }

    const result = diffExtractions(base, head, meta)

    expect(result.frontendApiCalls).toBeDefined()
    expect(result.frontendApiCalls!.added).toHaveLength(1)
  })

  it("populates frontendApiCalls when only base has apiCalls", () => {
    const base: ExtractionSnapshot = {
      ...emptySnapshot(),
      apiCalls: [
        {
          method: "GET",
          url: "/api/loan/status/:id",
          sourceFile: "src/api/loan.api.ts",
        },
      ],
    }
    const head = emptySnapshot() // no apiCalls field

    const result = diffExtractions(base, head, meta)

    expect(result.frontendApiCalls).toBeDefined()
    expect(result.frontendApiCalls!.removed).toHaveLength(1)
  })
})
