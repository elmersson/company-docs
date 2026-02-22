import { describe, it, expect } from "vitest"
import {
  detectFlows,
  normalizeUrl,
  matchRoute,
  generateFlowName,
} from "../src/flow-detector.js"
import type {
  FrontendApiCall,
  RouteChange,
  EventChange,
  ModelChange,
} from "../src/types.js"

// ---------------------------------------------------------------------------
// normalizeUrl
// ---------------------------------------------------------------------------

describe("normalizeUrl", () => {
  it("strips protocol and host", () => {
    expect(normalizeUrl("https://api.example.com/loan/apply")).toBe("/loan/apply")
  })

  it("strips http protocol and host", () => {
    expect(normalizeUrl("http://localhost:3000/loan/apply")).toBe("/loan/apply")
  })

  it("strips /api prefix", () => {
    expect(normalizeUrl("/api/loan/apply")).toBe("/loan/apply")
  })

  it("strips /api/v1 prefix", () => {
    expect(normalizeUrl("/api/v1/loan/apply")).toBe("/loan/apply")
  })

  it("strips /api/v2 prefix", () => {
    expect(normalizeUrl("/api/v2/loan/apply")).toBe("/loan/apply")
  })

  it("strips full URL with /api prefix", () => {
    expect(normalizeUrl("https://api.example.com/api/loan/apply")).toBe("/loan/apply")
  })

  it("preserves path without prefix", () => {
    expect(normalizeUrl("/loan/apply")).toBe("/loan/apply")
  })

  it("ensures leading slash", () => {
    expect(normalizeUrl("loan/apply")).toBe("/loan/apply")
  })
})

// ---------------------------------------------------------------------------
// matchRoute
// ---------------------------------------------------------------------------

describe("matchRoute", () => {
  it("matches exact paths", () => {
    expect(matchRoute("/loan/apply", "/loan/apply")).toBe(true)
  })

  it("rejects non-matching paths", () => {
    expect(matchRoute("/loan/apply", "/loan/status")).toBe(false)
  })

  it("matches path parameters", () => {
    expect(matchRoute("/loan/123", "/loan/:id")).toBe(true)
  })

  it("matches multiple path parameters", () => {
    expect(matchRoute("/loan/123/payments/456", "/loan/:id/payments/:paymentId")).toBe(true)
  })

  it("rejects partial path matches", () => {
    expect(matchRoute("/loan/123/extra", "/loan/:id")).toBe(false)
  })

  it("rejects shorter URLs against longer patterns", () => {
    expect(matchRoute("/loan", "/loan/:id")).toBe(false)
  })

  it("handles root path", () => {
    expect(matchRoute("/", "/")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// generateFlowName
// ---------------------------------------------------------------------------

describe("generateFlowName", () => {
  it("generates name for POST route", () => {
    const route: RouteChange = {
      method: "POST",
      path: "/loan/apply",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 10,
    }
    expect(generateFlowName(route)).toBe("CreateLoanApplyFlow")
  })

  it("generates name for GET route", () => {
    const route: RouteChange = {
      method: "GET",
      path: "/loan/:id",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 20,
    }
    expect(generateFlowName(route)).toBe("GetLoanFlow")
  })

  it("generates name for DELETE route", () => {
    const route: RouteChange = {
      method: "DELETE",
      path: "/loan/:id",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 30,
    }
    expect(generateFlowName(route)).toBe("DeleteLoanFlow")
  })

  it("generates name for PUT route", () => {
    const route: RouteChange = {
      method: "PUT",
      path: "/loan/:id",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 40,
    }
    expect(generateFlowName(route)).toBe("UpdateLoanFlow")
  })

  it("generates name for PATCH route", () => {
    const route: RouteChange = {
      method: "PATCH",
      path: "/loan/:id/status",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 50,
    }
    expect(generateFlowName(route)).toBe("UpdateLoanStatusFlow")
  })

  it("strips path parameters from name", () => {
    const route: RouteChange = {
      method: "GET",
      path: "/user/:userId/loan/:loanId",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 60,
    }
    expect(generateFlowName(route)).toBe("GetUserLoanFlow")
  })
})

// ---------------------------------------------------------------------------
// detectFlows
// ---------------------------------------------------------------------------

describe("detectFlows", () => {
  const backendRoutes: RouteChange[] = [
    {
      method: "POST",
      path: "/loan/apply",
      requestDto: "LoanApplicationDto",
      responseDto: "LoanResultDto",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 10,
    },
    {
      method: "GET",
      path: "/loan/:id",
      responseDto: "LoanDetailDto",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 25,
    },
    {
      method: "DELETE",
      path: "/loan/:id",
      sourceFile: "src/routes/loan.ts",
      sourceLine: 40,
    },
  ]

  const backendEvents: EventChange[] = [
    {
      name: "LoanCreatedEvent",
      payload: "LoanApplicationDto",
      sourceFile: "src/routes/loan.ts",
    },
    {
      name: "UserNotifiedEvent",
      sourceFile: "src/routes/notifications.ts",
    },
  ]

  const models: ModelChange[] = [
    {
      name: "LoanApplicationDto",
      fields: [
        { name: "amount", type: "number", optional: false },
        { name: "email", type: "string", optional: false },
      ],
      sourceFile: "src/dto/loan.dto.ts",
    },
    {
      name: "LoanResultDto",
      fields: [
        { name: "approved", type: "boolean", optional: false },
        { name: "loanId", type: "string", optional: false },
      ],
      sourceFile: "src/dto/loan.dto.ts",
    },
    {
      name: "LoanDetailDto",
      fields: [
        { name: "id", type: "string", optional: false },
        { name: "status", type: "string", optional: false },
      ],
      sourceFile: "src/dto/loan.dto.ts",
    },
  ]

  it("matches a frontend call to a backend route", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/api/loan/apply",
        method: "POST",
        requestDto: "LoanApplicationDto",
        responseDto: "LoanResultDto",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(1)
    expect(flows[0].flowName).toBe("CreateLoanApplyFlow")
    expect(flows[0].frontendService).toBe("web-checkout")
    expect(flows[0].backendService).toBe("loan-api")
    expect(flows[0].backendRoute.path).toBe("/loan/apply")
    expect(flows[0].frontendCall.url).toBe("/api/loan/apply")
  })

  it("resolves request and response DTOs", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/loan/apply",
        method: "POST",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(1)
    expect(flows[0].requestDto).toBeDefined()
    expect(flows[0].requestDto!.name).toBe("LoanApplicationDto")
    expect(flows[0].responseDto).toBeDefined()
    expect(flows[0].responseDto!.name).toBe("LoanResultDto")
  })

  it("finds related events by source file heuristic", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/loan/apply",
        method: "POST",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(1)
    // LoanCreatedEvent is in same source file as the route handler
    expect(flows[0].events).toHaveLength(1)
    expect(flows[0].events[0].name).toBe("LoanCreatedEvent")
  })

  it("does not include events from different source files", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/loan/apply",
        method: "POST",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    // UserNotifiedEvent is in a different file
    const eventNames = flows[0].events.map((e) => e.name)
    expect(eventNames).not.toContain("UserNotifiedEvent")
  })

  it("handles full URL with protocol and host", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "https://api.example.com/loan/apply",
        method: "POST",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(1)
    expect(flows[0].backendRoute.path).toBe("/loan/apply")
  })

  it("handles versioned API prefix", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/api/v1/loan/apply",
        method: "POST",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(1)
  })

  it("matches path parameters in URLs", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/api/loan/abc-123",
        method: "GET",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(1)
    expect(flows[0].backendRoute.path).toBe("/loan/:id")
    expect(flows[0].flowName).toBe("GetLoanFlow")
  })

  it("returns empty array when no matches found", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/api/users/me",
        method: "GET",
        sourceFile: "src/api/user.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(0)
  })

  it("returns empty array for empty inputs", () => {
    const flows = detectFlows([], [], [], [], "web-checkout", "loan-api")
    expect(flows).toHaveLength(0)
  })

  it("does not match when method differs", () => {
    const routes: RouteChange[] = [
      {
        method: "POST",
        path: "/loan/apply",
        requestDto: "LoanApplicationDto",
        sourceFile: "src/routes/loan.ts",
        sourceLine: 10,
      },
    ]

    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/loan/apply",
        method: "GET",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, routes, [], models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(0)
  })

  it("detects multiple flows from multiple frontend calls", () => {
    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/api/loan/apply",
        method: "POST",
        sourceFile: "src/api/loan.api.ts",
      },
      {
        url: "/api/loan/abc-123",
        method: "GET",
        sourceFile: "src/api/loan.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, backendRoutes, backendEvents, models,
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(2)
    const flowNames = flows.map((f) => f.flowName)
    expect(flowNames).toContain("CreateLoanApplyFlow")
    expect(flowNames).toContain("GetLoanFlow")
  })

  it("resolves DTO from frontend call when backend does not specify one", () => {
    const routes: RouteChange[] = [
      {
        method: "POST",
        path: "/payment/submit",
        sourceFile: "src/routes/payment.ts",
        sourceLine: 10,
      },
    ]

    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/payment/submit",
        method: "POST",
        requestDto: "PaymentDto",
        sourceFile: "src/api/payment.api.ts",
      },
    ]

    const paymentModel: ModelChange = {
      name: "PaymentDto",
      fields: [{ name: "amount", type: "number", optional: false }],
      sourceFile: "src/dto/payment.dto.ts",
    }

    const flows = detectFlows(
      frontendCalls, routes, [], [paymentModel],
      "web-checkout", "payment-api",
    )

    expect(flows).toHaveLength(1)
    expect(flows[0].requestDto).toBeDefined()
    expect(flows[0].requestDto!.name).toBe("PaymentDto")
  })

  it("handles flow with no DTOs or events", () => {
    const routes: RouteChange[] = [
      {
        method: "GET",
        path: "/health",
        sourceFile: "src/routes/health.ts",
        sourceLine: 1,
      },
    ]

    const frontendCalls: FrontendApiCall[] = [
      {
        url: "/health",
        method: "GET",
        sourceFile: "src/api/health.api.ts",
      },
    ]

    const flows = detectFlows(
      frontendCalls, routes, [], [],
      "web-checkout", "loan-api",
    )

    expect(flows).toHaveLength(1)
    expect(flows[0].requestDto).toBeUndefined()
    expect(flows[0].responseDto).toBeUndefined()
    expect(flows[0].events).toHaveLength(0)
  })
})
