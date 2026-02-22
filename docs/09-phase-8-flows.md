# Phase 8 - Flow Detection (Backend <-> Frontend)

**Duration:** 3-4 days
**Dependencies:** Phase 3 (extractor), Phase 4 (both backend + frontend actions working)
**Outcome:** Automatic detection and documentation of cross-service data flows

---

## Objective

Detect end-to-end flows that span frontend and backend:

```
User clicks "Apply" in web-checkout
    -> Frontend calls POST /loan/apply
    -> Backend receives request
    -> Backend validates LoanApplicationDto
    -> Backend creates loan record
    -> Backend emits LoanCreatedEvent
    -> Response returned to frontend
    -> Frontend displays LoanResultDto
```

This flow is never documented anywhere today. The system will generate it automatically by cross-referencing frontend API calls with backend routes and events.

---

## Flow Detection Algorithm

### Step 1: Collect All Extractions

After both backend and frontend docs exist in `services/`, we have:

```
services/loan-api/_meta-pr-482.json     (backend)
services/web-checkout/_meta-pr-115.json  (frontend)
```

Plus the full extraction data stored alongside each PR.

### Step 2: Match Frontend Calls to Backend Routes

```typescript
type FlowMatch = {
  flowName: string
  frontendService: string
  backendService: string
  frontendCall: FrontendApiCall
  backendRoute: RouteChange
  requestDto?: ModelChange
  responseDto?: ModelChange
  events: EventChange[]
}

function detectFlows(
  frontendCalls: FrontendApiCall[],
  backendRoutes: RouteChange[],
  backendEvents: EventChange[],
  models: ModelChange[]
): FlowMatch[] {
  const flows: FlowMatch[] = []

  for (const call of frontendCalls) {
    // Normalize URL: strip /api prefix, base URL, etc.
    const normalizedUrl = normalizeUrl(call.url)

    // Find matching backend route
    const matchingRoute = backendRoutes.find(route =>
      matchRoute(normalizedUrl, route.path) &&
      call.method.toUpperCase() === route.method
    )

    if (!matchingRoute) continue

    // Find related DTOs
    const requestDto = models.find(m =>
      m.name === matchingRoute.requestDto || m.name === call.requestDto
    )
    const responseDto = models.find(m =>
      m.name === matchingRoute.responseDto || m.name === call.responseDto
    )

    // Find events emitted by the handler
    // (heuristic: events in the same file as the route handler)
    const relatedEvents = backendEvents.filter(e =>
      e.sourceFile === matchingRoute.sourceFile
    )

    // Generate flow name from route
    const flowName = generateFlowName(matchingRoute)

    flows.push({
      flowName,
      frontendService: "web-checkout",  // from context
      backendService: "loan-api",       // from context
      frontendCall: call,
      backendRoute: matchingRoute,
      requestDto,
      responseDto,
      events: relatedEvents,
    })
  }

  return flows
}
```

### Step 3: URL Matching

```typescript
/**
 * Normalize frontend URL to match backend route pattern.
 * Frontend: "/api/loan/apply" or "https://api.example.com/loan/apply"
 * Backend:  "/loan/apply"
 */
function normalizeUrl(url: string): string {
  // Remove protocol + host
  let normalized = url.replace(/^https?:\/\/[^/]+/, "")

  // Remove common prefixes
  normalized = normalized.replace(/^\/api\/v\d+/, "")
  normalized = normalized.replace(/^\/api/, "")

  return normalized
}

/**
 * Match a URL against an Express route pattern.
 * Handles path parameters: /loan/:id matches /loan/123
 */
function matchRoute(url: string, routePattern: string): boolean {
  // Convert Express params to regex
  const regexStr = routePattern
    .replace(/:(\w+)/g, "([^/]+)")
    .replace(/\//g, "\\/")

  const regex = new RegExp(`^${regexStr}$`)
  return regex.test(url)
}
```

### Step 4: Generate Flow Name

```typescript
function generateFlowName(route: RouteChange): string {
  // POST /loan/apply -> ApplyLoanFlow
  // GET /loan/:id -> GetLoanFlow
  // DELETE /loan/:id -> DeleteLoanFlow

  const method = route.method.toLowerCase()
  const pathParts = route.path
    .split("/")
    .filter(p => p && !p.startsWith(":"))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))

  const methodMap: Record<string, string> = {
    get: "Get",
    post: "Create",
    put: "Update",
    patch: "Update",
    delete: "Delete",
  }

  const verb = methodMap[method] || method
  return `${verb}${pathParts.join("")}Flow`
}
```

---

## When Flow Detection Runs

Flow detection is a **post-processing step** that runs in two places:

### 1. During Astro Site Build

```typescript
// site/src/utils/flow-detector.ts
// Runs at build time, reads all metadata from services/ directory,
// cross-references frontend calls with backend routes,
// generates flow pages.
```

### 2. During Docs PR Creation (Optional Enhancement)

If both frontend and backend metadata already exist in `company-docs`, the PR creation script can also generate flow docs inline.

---

## Flow Documentation Output

### Claude Prompt Input

```json
{
  "flowName": "ApplyLoanFlow",
  "frontendService": "web-checkout",
  "backendService": "loan-api",
  "steps": [
    {
      "actor": "frontend",
      "action": "User submits loan application form",
      "service": "web-checkout",
      "detail": "Calls POST /api/loan/apply with LoanApplicationDto"
    },
    {
      "actor": "backend",
      "action": "Receives and validates request",
      "service": "loan-api",
      "detail": "Route POST /loan/apply, validates LoanApplicationDto"
    },
    {
      "actor": "backend",
      "action": "Processes loan application",
      "service": "loan-api",
      "detail": "Creates loan record, runs eligibility checks"
    },
    {
      "actor": "backend",
      "action": "Emits domain event",
      "service": "loan-api",
      "detail": "Publishes LoanCreatedEvent"
    },
    {
      "actor": "backend",
      "action": "Returns response",
      "service": "loan-api",
      "detail": "Returns LoanResultDto to frontend"
    },
    {
      "actor": "frontend",
      "action": "Displays result",
      "service": "web-checkout",
      "detail": "Shows approval/rejection using LoanResultDto"
    }
  ],
  "requestDto": {
    "name": "LoanApplicationDto",
    "fields": [
      { "name": "amount", "type": "number" },
      { "name": "employmentStatus", "type": "EmploymentStatus" }
    ]
  },
  "responseDto": {
    "name": "LoanResultDto",
    "fields": [
      { "name": "approved", "type": "boolean" },
      { "name": "loanId", "type": "string" }
    ]
  },
  "events": [
    { "name": "LoanCreatedEvent", "payload": "LoanApplicationDto" }
  ]
}
```

### Generated HTML Output

Written to: `services/loan-api/flows/ApplyLoanFlow.html`

The HTML includes:
- Flow title and description
- Step-by-step visual flow
- Request/response data structure tables
- Events emitted
- Links to related API, model, and event docs

---

## Handling Incomplete Data

Not every flow will have both frontend and backend data available:

| Scenario | Behavior |
|---|---|
| Backend route exists, no frontend calls found | Document route only, note "No known consumers" |
| Frontend call exists, no matching backend route | Flag as potential issue: "Endpoint not found in backend" |
| Event emitted but no consumer | Document event, note "No known subscribers" |
| Both exist and match | Full flow generated |

---

## Acceptance Criteria

- [ ] Flow detection matches frontend API calls to backend routes
- [ ] URL normalization handles common prefix patterns (/api, /api/v1)
- [ ] Express path parameters matched correctly
- [ ] Flow names generated from route patterns
- [ ] Claude generates flow documentation HTML
- [ ] Flows written to `services/{service}/flows/`
- [ ] Incomplete flows handled gracefully (partial data)
- [ ] Works at both PR-time and Astro build-time
