import { describe, it, expect } from "vitest"
import { extractPrismaSchema } from "../src/extractors/prisma-schema.js"
import { join } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIXTURE_PATH = join(__dirname, "fixtures/express-app")

describe("Prisma Schema Extractor", () => {
  it("extracts model definitions from schema.prisma", () => {
    const tables = extractPrismaSchema(
      join(FIXTURE_PATH, "src/prisma/schema.prisma"),
    )

    expect(tables.length).toBeGreaterThanOrEqual(2)
  })

  it("extracts LoanApplication model with all fields", () => {
    const tables = extractPrismaSchema(
      join(FIXTURE_PATH, "src/prisma/schema.prisma"),
    )

    const loanTable = tables.find((t) => t.table === "LoanApplication")
    expect(loanTable).toBeDefined()

    const columnNames = loanTable!.columns.added.map((c) => c.name)
    expect(columnNames).toContain("id")
    expect(columnNames).toContain("amount")
    expect(columnNames).toContain("employmentStatus")
    expect(columnNames).toContain("applicantName")
    expect(columnNames).toContain("email")
  })

  it("preserves Prisma types", () => {
    const tables = extractPrismaSchema(
      join(FIXTURE_PATH, "src/prisma/schema.prisma"),
    )

    const loanTable = tables.find((t) => t.table === "LoanApplication")!
    const amountCol = loanTable.columns.added.find((c) => c.name === "amount")
    expect(amountCol!.type).toBe("Float")

    const idCol = loanTable.columns.added.find((c) => c.name === "id")
    expect(idCol!.type).toBe("String")
  })

  it("extracts AuditLog model", () => {
    const tables = extractPrismaSchema(
      join(FIXTURE_PATH, "src/prisma/schema.prisma"),
    )

    const auditTable = tables.find((t) => t.table === "AuditLog")
    expect(auditTable).toBeDefined()

    const columnNames = auditTable!.columns.added.map((c) => c.name)
    expect(columnNames).toContain("action")
    expect(columnNames).toContain("userId")
  })

  it("returns empty array for non-existent file", () => {
    const tables = extractPrismaSchema(
      join(FIXTURE_PATH, "nonexistent.prisma"),
    )
    expect(tables).toHaveLength(0)
  })

  it("initializes removed and modified as empty arrays", () => {
    const tables = extractPrismaSchema(
      join(FIXTURE_PATH, "src/prisma/schema.prisma"),
    )

    for (const table of tables) {
      expect(table.columns.removed).toHaveLength(0)
      expect(table.columns.modified).toHaveLength(0)
    }
  })
})
