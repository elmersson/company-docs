import { readFileSync, existsSync } from "fs"
import type { TableChange } from "../types.js"

/**
 * Parse a Prisma schema file and extract model definitions.
 * Returns table structures that can be diffed between base and head.
 *
 * Unlike other extractors, this does not use ts-morph — Prisma schemas
 * are not TypeScript. We parse the .prisma file with regex.
 */
export function extractPrismaSchema(schemaPath: string): TableChange[] {
  if (!existsSync(schemaPath)) {
    return []
  }

  const content = readFileSync(schemaPath, "utf-8")
  const models = parsePrismaModels(content)

  return models.map((model) => ({
    table: model.name,
    columns: {
      added: model.fields.map((f) => ({ name: f.name, type: f.type })),
      removed: [],
      modified: [],
    },
  }))
}

type PrismaModel = {
  name: string
  fields: { name: string; type: string }[]
}

function parsePrismaModels(content: string): PrismaModel[] {
  const models: PrismaModel[] = []
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g

  let match
  while ((match = modelRegex.exec(content)) !== null) {
    const name = match[1]
    const body = match[2]

    const fields: { name: string; type: string }[] = []
    const lines = body.split("\n")

    for (const line of lines) {
      const trimmed = line.trim()

      // Skip empty lines, comments, and Prisma directives
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) {
        continue
      }

      // Match field declarations: fieldName Type ...
      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+[\[\]?]*)/)
      if (fieldMatch) {
        fields.push({
          name: fieldMatch[1],
          type: fieldMatch[2],
        })
      }
    }

    models.push({ name, fields })
  }

  return models
}
