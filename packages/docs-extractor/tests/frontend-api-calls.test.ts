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
})
