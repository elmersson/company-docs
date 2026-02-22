import { describe, it, expect } from "vitest"
import { extractExpressRoutes } from "../src/extractors/express-routes.js"
import { join } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const FIXTURE_PATH = join(__dirname, "fixtures/express-app")

describe("Express Route Extractor", () => {
  it("detects POST route with middleware", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    const postRoute = routes.find(
      (r) => r.method === "POST" && r.path === "/loan/apply",
    )
    expect(postRoute).toBeDefined()
    expect(postRoute!.middleware).toContain("auth")
    expect(postRoute!.middleware).toContain("validate")
    expect(postRoute!.sourceFile).toContain("loan.ts")
    expect(postRoute!.sourceLine).toBeGreaterThan(0)
  })

  it("detects GET route with path parameter", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    const getRoute = routes.find(
      (r) => r.method === "GET" && r.path === "/loan/:id",
    )
    expect(getRoute).toBeDefined()
    expect(getRoute!.middleware).toContain("auth")
  })

  it("detects GET route without middleware", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    const statusRoute = routes.find(
      (r) => r.method === "GET" && r.path === "/loan/status/:id",
    )
    expect(statusRoute).toBeDefined()
    expect(statusRoute!.middleware).toBeUndefined()
  })

  it("detects DELETE route", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/routes/loan.ts"])

    const deleteRoute = routes.find((r) => r.method === "DELETE")
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

  it("extracts routes from multiple files", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, [
      "src/routes/loan.ts",
      "src/routes/health.ts",
    ])

    const healthRoute = routes.find((r) => r.path === "/health")
    expect(healthRoute).toBeDefined()
    expect(healthRoute!.method).toBe("GET")

    // Should also have loan routes
    const loanRoutes = routes.filter((r) => r.path.startsWith("/loan"))
    expect(loanRoutes.length).toBeGreaterThan(0)
  })

  it("returns empty array for files with no routes", () => {
    const routes = extractExpressRoutes(FIXTURE_PATH, ["src/dto/loan.dto.ts"])
    expect(routes).toHaveLength(0)
  })
})
