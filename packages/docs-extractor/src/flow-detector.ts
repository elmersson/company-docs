import type {
  FrontendApiCall,
  RouteChange,
  EventChange,
  ModelChange,
  FlowMatch,
} from "./types.js"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect end-to-end flows by matching frontend API calls to backend routes.
 * Pure data matching — no LLM involved.
 */
export function detectFlows(
  frontendCalls: FrontendApiCall[],
  backendRoutes: RouteChange[],
  backendEvents: EventChange[],
  models: ModelChange[],
  frontendService: string,
  backendService: string,
): FlowMatch[] {
  const flows: FlowMatch[] = []

  for (const call of frontendCalls) {
    const normalizedUrl = normalizeUrl(call.url)

    // Find matching backend route
    const matchingRoute = backendRoutes.find(
      (route) =>
        matchRoute(normalizedUrl, route.path) &&
        call.method.toUpperCase() === route.method,
    )

    if (!matchingRoute) continue

    // Find related DTOs
    const requestDto = models.find(
      (m) => m.name === matchingRoute.requestDto || m.name === call.requestDto,
    )
    const responseDto = models.find(
      (m) => m.name === matchingRoute.responseDto || m.name === call.responseDto,
    )

    // Find events emitted by the handler (same source file heuristic)
    const relatedEvents = backendEvents.filter(
      (e) => e.sourceFile === matchingRoute.sourceFile,
    )

    const flowName = generateFlowName(matchingRoute)

    flows.push({
      flowName,
      frontendService,
      backendService,
      frontendCall: call,
      backendRoute: matchingRoute,
      requestDto,
      responseDto,
      events: relatedEvents,
    })
  }

  return flows
}

// ---------------------------------------------------------------------------
// URL normalization
// ---------------------------------------------------------------------------

/**
 * Normalize frontend URL to match backend route pattern.
 * Strips protocol + host, common API prefixes.
 *
 * Examples:
 *   "https://api.example.com/loan/apply" -> "/loan/apply"
 *   "/api/v1/loan/apply"                 -> "/loan/apply"
 *   "/api/loan/apply"                    -> "/loan/apply"
 *   "/loan/apply"                        -> "/loan/apply"
 */
export function normalizeUrl(url: string): string {
  // Remove protocol + host
  let normalized = url.replace(/^https?:\/\/[^/]+/, "")

  // Remove common prefixes
  normalized = normalized.replace(/^\/api\/v\d+/, "")
  normalized = normalized.replace(/^\/api/, "")

  // Ensure leading slash
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`
  }

  return normalized
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

/**
 * Match a URL against an Express route pattern.
 * Handles path parameters: /loan/:id matches /loan/123
 */
export function matchRoute(url: string, routePattern: string): boolean {
  // Convert Express params to regex groups
  const regexStr = routePattern
    .replace(/:(\w+)/g, "([^/]+)")
    .replace(/\//g, "\\/")

  const regex = new RegExp(`^${regexStr}$`)
  return regex.test(url)
}

// ---------------------------------------------------------------------------
// Flow name generation
// ---------------------------------------------------------------------------

/**
 * Generate a human-readable flow name from a route.
 *
 * Examples:
 *   POST /loan/apply     -> CreateLoanApplyFlow
 *   GET  /loan/:id       -> GetLoanFlow
 *   DELETE /loan/:id     -> DeleteLoanFlow
 */
export function generateFlowName(route: RouteChange): string {
  const method = route.method.toLowerCase()
  const pathParts = route.path
    .split("/")
    .filter((p) => p && !p.startsWith(":"))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))

  const METHOD_MAP: Record<string, string> = {
    get: "Get",
    post: "Create",
    put: "Update",
    patch: "Update",
    delete: "Delete",
  }

  const verb = METHOD_MAP[method] || method
  return `${verb}${pathParts.join("")}Flow`
}
