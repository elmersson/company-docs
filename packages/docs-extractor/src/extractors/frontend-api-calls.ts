import { Project, SyntaxKind, type CallExpression } from "ts-morph"
import type { FrontendApiCall } from "../types.js"

/**
 * Extract frontend API calls (fetch/axios) from a project using static analysis.
 *
 * Detects:
 * - fetch(url, options) calls
 * - axios.METHOD(url) / api.METHOD(url) calls
 */
export function extractFrontendApiCalls(
  projectPath: string,
  apiCallPatterns: string[],
): FrontendApiCall[] {
  const project = new Project({
    tsConfigFilePath: `${projectPath}/tsconfig.json`,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  })

  for (const pattern of apiCallPatterns) {
    project.addSourceFilesAtPaths(`${projectPath}/${pattern}`)
  }

  const apiCalls: FrontendApiCall[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const fullPath = sourceFile.getFilePath()
    const relativePath = fullPath.startsWith(projectPath)
      ? fullPath.slice(projectPath.length + 1)
      : fullPath

    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

    for (const call of calls) {
      // Detect fetch() calls
      const fetchCall = tryParseFetchCall(call)
      if (fetchCall) {
        apiCalls.push({ ...fetchCall, sourceFile: relativePath } as FrontendApiCall)
        continue
      }

      // Detect axios calls
      const axiosCall = tryParseAxiosCall(call)
      if (axiosCall) {
        apiCalls.push({ ...axiosCall, sourceFile: relativePath } as FrontendApiCall)
      }
    }
  }

  return apiCalls
}

function tryParseFetchCall(
  call: CallExpression,
): Omit<FrontendApiCall, "sourceFile"> | null {
  const expr = call.getExpression()
  if (expr.getText() !== "fetch") return null

  const args = call.getArguments()
  if (args.length === 0) return null

  // URL must be a string literal (skip template literals for now)
  const urlArg = args[0]
  if (urlArg.getKind() !== SyntaxKind.StringLiteral) return null

  const url = urlArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()

  // Extract method from options object (defaults to GET)
  let method = "GET"
  if (args.length > 1) {
    const options = args[1]
    if (options.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const objLiteral = options.asKindOrThrow(
        SyntaxKind.ObjectLiteralExpression,
      )
      const methodProp = objLiteral.getProperty("method")
      if (methodProp && methodProp.getKind() === SyntaxKind.PropertyAssignment) {
        const init = methodProp
          .asKindOrThrow(SyntaxKind.PropertyAssignment)
          .getInitializer()
        if (init?.getKind() === SyntaxKind.StringLiteral) {
          method = init
            .asKindOrThrow(SyntaxKind.StringLiteral)
            .getLiteralValue()
            .toUpperCase()
        }
      }
    }
  }

  return { url, method }
}

function tryParseAxiosCall(
  call: CallExpression,
): Omit<FrontendApiCall, "sourceFile"> | null {
  const expr = call.getExpression()
  const text = expr.getText()

  // Match patterns like: axios.get, axios.post, api.get, api.post, etc.
  const axiosMethodMatch = text.match(/\w+\.(get|post|put|patch|delete)$/i)
  if (!axiosMethodMatch) return null

  const method = axiosMethodMatch[1].toUpperCase()
  const args = call.getArguments()
  if (args.length === 0) return null

  // URL must be a string literal
  const urlArg = args[0]
  if (urlArg.getKind() !== SyntaxKind.StringLiteral) return null

  const url = urlArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()

  // Try to resolve generic type parameter (e.g. axios.post<ResponseDto>)
  const typeArgs = call.getTypeArguments()
  const responseDto = typeArgs.length > 0 ? typeArgs[0].getText() : undefined

  return { url, method, responseDto }
}
