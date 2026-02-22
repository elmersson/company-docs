import { describe, it, expect } from "vitest"
import { extractDtoModels } from "../src/extractors/dto-models.js"
import { join } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIXTURE_PATH = join(__dirname, "fixtures/express-app")

describe("DTO Model Extractor", () => {
  it("extracts exported interface with all fields", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    const loanDto = models.find((m) => m.name === "LoanApplicationDto")
    expect(loanDto).toBeDefined()
    expect(loanDto!.fields).toHaveLength(5)

    const amountField = loanDto!.fields.find((f) => f.name === "amount")
    expect(amountField).toBeDefined()
    expect(amountField!.type).toBe("number")
    expect(amountField!.optional).toBe(false)
  })

  it("detects optional fields", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    const loanDto = models.find((m) => m.name === "LoanApplicationDto")
    const monthlyIncome = loanDto!.fields.find(
      (f) => f.name === "monthlyIncome",
    )
    expect(monthlyIncome).toBeDefined()
    expect(monthlyIncome!.optional).toBe(true)
  })

  it("extracts multiple interfaces from same file", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    const resultDto = models.find((m) => m.name === "LoanResultDto")
    expect(resultDto).toBeDefined()
    expect(resultDto!.fields.length).toBeGreaterThan(0)
  })

  it("extracts exported type aliases with object shape", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    const statusDto = models.find((m) => m.name === "LoanStatusDto")
    expect(statusDto).toBeDefined()
    expect(statusDto!.fields.length).toBeGreaterThan(0)

    const idField = statusDto!.fields.find((f) => f.name === "id")
    expect(idField).toBeDefined()
    expect(idField!.type).toBe("string")
  })

  it("includes source file path", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/dto/loan.dto.ts"])

    for (const model of models) {
      expect(model.sourceFile).toContain("loan.dto.ts")
    }
  })

  it("returns empty array for files with no exported types", () => {
    const models = extractDtoModels(FIXTURE_PATH, ["src/routes/loan.ts"])
    // Routes file should have no exported interfaces/types (only export default router)
    expect(models).toHaveLength(0)
  })
})
