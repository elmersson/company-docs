import { Project, SyntaxKind } from "ts-morph"
import type { EventChange } from "../types.js"

/**
 * Extract events being published from a project using static analysis.
 *
 * Detects:
 * - *.publish(new EventClass(payload)) — class-based events
 * - *.emit("event-name", payload) — string-based events
 */
export function extractEvents(
  projectPath: string,
  eventPatterns: string[],
): EventChange[] {
  const project = new Project({
    tsConfigFilePath: `${projectPath}/tsconfig.json`,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  })

  for (const pattern of eventPatterns) {
    project.addSourceFilesAtPaths(`${projectPath}/${pattern}`)
  }

  const events: EventChange[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const fullPath = sourceFile.getFilePath()
    const relativePath = fullPath.startsWith(projectPath)
      ? fullPath.slice(projectPath.length + 1)
      : fullPath

    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )

    for (const call of callExpressions) {
      const text = call.getExpression().getText()

      // Detect publish/emit calls
      if (!text.endsWith(".publish") && !text.endsWith(".emit")) {
        continue
      }

      const args = call.getArguments()
      if (args.length === 0) continue

      const firstArg = args[0]

      // Check for `new EventClass()`
      if (firstArg.getKind() === SyntaxKind.NewExpression) {
        const newExpr = firstArg.asKindOrThrow(SyntaxKind.NewExpression)
        const className = newExpr.getExpression().getText()

        events.push({
          name: className,
          payload: resolveEventPayload(newExpr),
          sourceFile: relativePath,
        })
      }

      // Check for string event name: emit("loan.created", ...)
      if (firstArg.getKind() === SyntaxKind.StringLiteral) {
        const eventName = firstArg
          .asKindOrThrow(SyntaxKind.StringLiteral)
          .getLiteralValue()

        events.push({
          name: eventName,
          channel: eventName,
          sourceFile: relativePath,
        })
      }
    }
  }

  return events
}

function resolveEventPayload(
  newExpr: import("ts-morph").NewExpression,
): string | undefined {
  // Try to get the class constructor's first parameter type
  // For now, return the class name + "Payload" convention
  // or look at the arguments passed to the constructor
  const args = newExpr.getArguments()
  if (args.length > 0) {
    const firstArg = args[0]
    // If it's an object literal, try to get its type
    const type = firstArg.getType()
    const text = type.getText()
    // Return simplified type if not too complex
    if (text.length < 100 && text !== "any") {
      return text
    }
  }
  return undefined
}
