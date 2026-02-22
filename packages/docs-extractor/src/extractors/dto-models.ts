import { Project } from "ts-morph"
import type { ModelChange, FieldChange } from "../types.js"

/**
 * Extract exported interfaces and type aliases from a project.
 *
 * Detects:
 * - Exported interfaces with their properties
 * - Exported type aliases with object literal shapes
 */
export function extractDtoModels(
  projectPath: string,
  dtoPatterns: string[],
): ModelChange[] {
  const project = new Project({
    tsConfigFilePath: `${projectPath}/tsconfig.json`,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  })

  for (const pattern of dtoPatterns) {
    project.addSourceFilesAtPaths(`${projectPath}/${pattern}`)
  }

  const models: ModelChange[] = []

  for (const sourceFile of project.getSourceFiles()) {
    const fullPath = sourceFile.getFilePath()
    const relativePath = fullPath.startsWith(projectPath)
      ? fullPath.slice(projectPath.length + 1)
      : fullPath

    // Extract exported interfaces
    const interfaces = sourceFile.getInterfaces().filter((i) => i.isExported())

    for (const iface of interfaces) {
      const fields: FieldChange[] = iface.getProperties().map((prop) => ({
        name: prop.getName(),
        type: prop.getType().getText(prop),
        optional: prop.hasQuestionToken(),
      }))

      models.push({
        name: iface.getName(),
        fields,
        sourceFile: relativePath,
      })
    }

    // Extract exported type aliases with object shapes
    const typeAliases = sourceFile
      .getTypeAliases()
      .filter((t) => t.isExported())

    for (const typeAlias of typeAliases) {
      const type = typeAlias.getType()
      if (type.isObject() && !type.isArray()) {
        const fields: FieldChange[] = type.getProperties().map((prop) => {
          const propType = prop.getTypeAtLocation(sourceFile)
          return {
            name: prop.getName(),
            type: propType.getText(),
            optional: prop.isOptional(),
          }
        })

        models.push({
          name: typeAlias.getName(),
          fields,
          sourceFile: relativePath,
        })
      }
    }
  }

  return models
}
