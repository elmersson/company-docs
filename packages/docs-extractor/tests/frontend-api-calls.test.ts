import { describe, it, expect } from "vitest"
import { extractFrontendApiCalls } from "../src/extractors/frontend-api-calls.js"
import { join } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIXTURE_PATH = join(__dirname, "fixtures/react-app")

describe("Frontend API Call Extractor", () => {
  it("detects axios POST call with generic type", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    const postCall = calls.find(
      (c) => c.method === "POST" && c.url === "/loan/apply",
    )
    expect(postCall).toBeDefined()
    expect(postCall!.responseDto).toBe("LoanResultDto")
    expect(postCall!.sourceFile).toContain("loan.api.ts")
  })

  it("detects axios DELETE call", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    const deleteCall = calls.find((c) => c.method === "DELETE")
    expect(deleteCall).toBeDefined()
  })

  it("detects fetch() call with template literal (skipped)", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    // Template literal URLs are not detected (known limitation)
    // The fetch with template literal `/api/loan/status/${id}` should be skipped
    const fetchWithTemplate = calls.find(
      (c) => c.url === "/api/loan/status/:id",
    )
    expect(fetchWithTemplate).toBeUndefined()
  })

  it("includes source file in results", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    for (const call of calls) {
      expect(call.sourceFile).toContain("loan.api.ts")
    }
  })

  it("returns empty array for files with no API calls", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/types/loan.types.ts",
    ])
    expect(calls).toHaveLength(0)
  })

  // --- New enrichment tests ---

  it("captures sourceLine for each call", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    for (const call of calls) {
      expect(call.sourceLine).toBeGreaterThan(0)
    }

    const postCall = calls.find((c) => c.method === "POST" && c.url === "/loan/apply")
    expect(postCall!.sourceLine).toBe(16)
  })

  it("captures callerFunction for function declarations", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    const postCall = calls.find((c) => c.method === "POST" && c.url === "/loan/apply")
    expect(postCall!.callerFunction).toBe("applyForLoan")

    const deleteCall = calls.find((c) => c.method === "DELETE")
    expect(deleteCall!.callerFunction).toBe("deleteLoan")
  })

  it("captures callerFunction for arrow function variables", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    const getListCall = calls.find((c) => c.method === "GET" && c.url === "/loan/list")
    expect(getListCall).toBeDefined()
    expect(getListCall!.callerFunction).toBe("fetchLoanList")
  })

  it("detects requestDto from axios second argument type", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    const postCall = calls.find((c) => c.method === "POST" && c.url === "/loan/apply")
    expect(postCall!.requestDto).toBe("LoanApplicationDto")
  })

  it("detects try-catch error handling", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    const updateCall = calls.find((c) => c.method === "PUT" && c.url === "/loan/update")
    expect(updateCall).toBeDefined()
    expect(updateCall!.errorHandling).toBe("try-catch")
    expect(updateCall!.callerFunction).toBe("updateLoan")
    expect(updateCall!.requestDto).toBe("UpdateLoanDto")
  })

  it("reports 'none' when no error handling is present", () => {
    const calls = extractFrontendApiCalls(FIXTURE_PATH, [
      "src/api/loan.api.ts",
    ])

    const postCall = calls.find((c) => c.method === "POST" && c.url === "/loan/apply")
    expect(postCall!.errorHandling).toBe("none")
  })
})
