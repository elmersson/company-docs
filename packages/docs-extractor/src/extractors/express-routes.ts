import { Project, SyntaxKind, type CallExpression, type Node } from "ts-morph"
import { existsSync } from "fs"
import type { RouteChange } from "../types.js"

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const

/**
 * Extract Express route definitions from a project using static analysis.
 *
 * Detects patterns:
 * - router.METHOD(path, ...middleware, handler)
 * - app.METHOD(path, handler)
 */
export function extractExpressRoutes(
  projectPath: string,
  entryPoints: string[],
): RouteChange[] {
  const tsConfigPath = `${projectPath}/tsconfig.json`
  const project = new Project({
    ...(existsSync(tsConfigPath) ? { tsConfigFilePath: tsConfigPath } : {}),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  })

  // Add source files matching the entry point globs
  for (const pattern of entryPoints) {
    project.addSourceFilesAtPaths(`${projectPath}/${pattern}`)
  }

  const routes: RouteChange[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )

    for (const call of callExpressions) {
      const route = tryParseRouteCall(call)
      if (route) {
        // Make sourceFile path relative to projectPath
        const fullPath = sourceFile.getFilePath()
        const relativePath = fullPath.startsWith(projectPath)
          ? fullPath.slice(projectPath.length + 1)
          : fullPath

        routes.push({
          ...route,
          sourceFile: relativePath,
          sourceLine: call.getStartLineNumber(),
        } as RouteChange)
      }
    }
  }

  return routes
}

function tryParseRouteCall(
  call: CallExpression,
): Omit<RouteChange, "sourceFile" | "sourceLine"> | null {
  const expression = call.getExpression()

  if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) {
    return null
  }

  const propAccess = expression.asKindOrThrow(
    SyntaxKind.PropertyAccessExpression,
  )
  const methodName = propAccess.getName().toLowerCase()

  if (!HTTP_METHODS.includes(methodName as (typeof HTTP_METHODS)[number])) {
    return null
  }

  const args = call.getArguments()
  if (args.length === 0) return null

  // First arg should be the path (string literal)
  const pathArg = args[0]
  if (pathArg.getKind() !== SyntaxKind.StringLiteral) return null

  const path = pathArg
    .asKindOrThrow(SyntaxKind.StringLiteral)
    .getLiteralValue()

  // Extract middleware names (all args between first and last)
  const middleware: string[] = []
  if (args.length > 2) {
    for (let i = 1; i < args.length - 1; i++) {
      const arg = args[i]
      if (arg.getKind() === SyntaxKind.Identifier) {
        middleware.push(arg.getText())
      } else if (arg.getKind() === SyntaxKind.CallExpression) {
        middleware.push(
          arg
            .asKindOrThrow(SyntaxKind.CallExpression)
            .getExpression()
            .getText(),
        )
      } else {
        middleware.push("unknown")
      }
    }
  }

  // Try to resolve request/response DTOs from the handler
  const handler = args[args.length - 1]
  const { requestDto, responseDto } = resolveHandlerTypes(handler)

  return {
    method: methodName.toUpperCase() as RouteChange["method"],
    path,
    requestDto,
    responseDto,
    middleware: middleware.length > 0 ? middleware : undefined,
  }
}

function resolveHandlerTypes(handler: Node): {
  requestDto?: string
  responseDto?: string
} {
  // For now, basic detection: look for type annotations on request parameter
  // or generic type arguments. Can be enhanced later.
  // This is intentionally simple for Phase 3 — the key insight is that
  // ts-morph gives us the AST to work with, and we can refine detection.
  return {}
}
