import {
  Project,
  SyntaxKind,
  type CallExpression,
  type Node,
} from "ts-morph"
import { existsSync } from "fs"
import type { FrontendApiCall } from "../types.js"

// ---------------------------------------------------------------------------
// Partial result from parse helpers (before enrichment)
// ---------------------------------------------------------------------------

type ParsedCall = {
  url: string
  method: string
  requestDto?: string
  responseDto?: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract frontend API calls (fetch/axios) from a project using static analysis.
 *
 * Detects:
 * - fetch(url, options) calls
 * - axios.METHOD(url) / api.METHOD(url) calls
 *
 * Enriches each call with:
 * - requestDto (type of the body argument)
 * - sourceLine
 * - callerFunction (enclosing function/method name)
 * - errorHandling (try-catch / .catch() / none)
 */
export function extractFrontendApiCalls(
  projectPath: string,
  apiCallPatterns: string[],
): FrontendApiCall[] {
  const tsConfigPath = `${projectPath}/tsconfig.json`
  const project = new Project({
    ...(existsSync(tsConfigPath) ? { tsConfigFilePath: tsConfigPath } : {}),
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
        apiCalls.push(enrichCall(fetchCall, call, relativePath))
        continue
      }

      // Detect axios calls
      const axiosCall = tryParseAxiosCall(call)
      if (axiosCall) {
        apiCalls.push(enrichCall(axiosCall, call, relativePath))
      }
    }
  }

  return apiCalls
}

// ---------------------------------------------------------------------------
// Enrichment — shared for both fetch and axios calls
// ---------------------------------------------------------------------------

/**
 * Add contextual metadata to a parsed API call.
 */
function enrichCall(
  parsed: ParsedCall,
  call: CallExpression,
  sourceFile: string,
): FrontendApiCall {
  return {
    ...parsed,
    sourceFile,
    sourceLine: call.getStartLineNumber(),
    callerFunction: findCallerFunction(call),
    errorHandling: detectErrorHandling(call),
  }
}

// ---------------------------------------------------------------------------
// Caller function detection
// ---------------------------------------------------------------------------

/**
 * Walk up the AST to find the nearest enclosing named function, method, or
 * arrow-function variable declaration.
 */
function findCallerFunction(node: Node): string | undefined {
  let current = node.getParent()
  while (current) {
    const kind = current.getKind()

    // Named function declaration: function applyForLoan() { ... }
    if (kind === SyntaxKind.FunctionDeclaration) {
      const name = current.asKindOrThrow(SyntaxKind.FunctionDeclaration).getName()
      if (name) return name
    }

    // Method declaration: class Foo { applyForLoan() { ... } }
    if (kind === SyntaxKind.MethodDeclaration) {
      return current.asKindOrThrow(SyntaxKind.MethodDeclaration).getName()
    }

    // Arrow function assigned to a const: const applyForLoan = async () => { ... }
    if (kind === SyntaxKind.ArrowFunction || kind === SyntaxKind.FunctionExpression) {
      const parent = current.getParent()
      if (parent?.getKind() === SyntaxKind.VariableDeclaration) {
        return parent.asKindOrThrow(SyntaxKind.VariableDeclaration).getName()
      }
    }

    current = current.getParent()
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Error handling detection
// ---------------------------------------------------------------------------

/**
 * Detect the error handling strategy around an API call.
 */
function detectErrorHandling(
  call: CallExpression,
): "try-catch" | "catch-chain" | "none" {
  // Check for .catch() chained on the call or its await parent
  const parent = call.getParent()
  if (parent?.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propAccess = parent.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
    if (propAccess.getName() === "catch") return "catch-chain"
  }

  // Also check: someCall().then(...).catch(...)
  const grandparent = parent?.getParent()
  if (grandparent?.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propAccess = grandparent.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
    if (propAccess.getName() === "catch") return "catch-chain"
  }

  // Check for enclosing try-catch
  let current = call.getParent()
  while (current) {
    if (current.getKind() === SyntaxKind.TryStatement) return "try-catch"
    // Stop at function boundaries
    const kind = current.getKind()
    if (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.ArrowFunction ||
      kind === SyntaxKind.FunctionExpression ||
      kind === SyntaxKind.MethodDeclaration
    ) {
      break
    }
    current = current.getParent()
  }

  return "none"
}

// ---------------------------------------------------------------------------
// fetch() parser
// ---------------------------------------------------------------------------

function tryParseFetchCall(call: CallExpression): ParsedCall | null {
  const expr = call.getExpression()
  if (expr.getText() !== "fetch") return null

  const args = call.getArguments()
  if (args.length === 0) return null

  // URL must be a string literal (skip template literals for now)
  const urlArg = args[0]
  if (urlArg.getKind() !== SyntaxKind.StringLiteral) return null

  const url = urlArg.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()

  // Extract method and requestDto from options object
  let method = "GET"
  let requestDto: string | undefined
  if (args.length > 1) {
    const options = args[1]
    if (options.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const objLiteral = options.asKindOrThrow(
        SyntaxKind.ObjectLiteralExpression,
      )

      // Method
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

      // Body — try to resolve the type of the body property value
      const bodyProp = objLiteral.getProperty("body")
      if (bodyProp && bodyProp.getKind() === SyntaxKind.PropertyAssignment) {
        const init = bodyProp
          .asKindOrThrow(SyntaxKind.PropertyAssignment)
          .getInitializer()
        if (init) {
          requestDto = tryResolveTypeName(init)
        }
      }
    }
  }

  return { url, method, requestDto }
}

// ---------------------------------------------------------------------------
// axios-style parser
// ---------------------------------------------------------------------------

function tryParseAxiosCall(call: CallExpression): ParsedCall | null {
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

  // Try to resolve request body type from second argument
  let requestDto: string | undefined
  if (args.length > 1) {
    requestDto = tryResolveTypeName(args[1])
  }

  return { url, method, responseDto, requestDto }
}

// ---------------------------------------------------------------------------
// Type resolution helpers
// ---------------------------------------------------------------------------

/**
 * Try to resolve a meaningful type name from an expression node.
 *
 * For a variable like `data: LoanApplicationDto`, resolves "LoanApplicationDto".
 * Strips wrapper types like `Promise<>`, and ignores primitives / anonymous types.
 */
function tryResolveTypeName(node: Node): string | undefined {
  try {
    const type = node.getType()
    const text = type.getText()

    // Skip unhelpful types
    if (!text || text === "any" || text === "unknown" || text === "never") {
      return undefined
    }

    // If the type is an interface/type alias, getText() returns the name directly
    // If it includes import paths like `import("...").LoanApplicationDto`,
    // extract just the type name
    const importMatch = text.match(/import\([^)]+\)\.(\w+)$/)
    if (importMatch) return importMatch[1]

    // Skip inline object types and union types — these aren't useful as DTO names
    if (text.startsWith("{") || text.includes("|")) return undefined

    // Skip primitives
    if (["string", "number", "boolean", "void", "null", "undefined"].includes(text)) {
      return undefined
    }

    return text
  } catch {
    return undefined
  }
}
