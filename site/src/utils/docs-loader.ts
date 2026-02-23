import { readFileSync, readdirSync, existsSync } from "fs"
import { join, relative } from "path"
import { glob } from "glob"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICES_DIR = join(process.cwd(), "..", "services")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DocEntry = {
  slug: string
  service: string
  docType: string
  entity: string
  html: string
  hasBreakingChanges: boolean
  generatedAt: string
  sourceRepo: string
  sourcePr: number
  sourcePrUrl: string
}

export type ServiceSummary = {
  name: string
  type: "backend" | "frontend"
  apiCount: number
  modelCount: number
  eventCount: number
  flowCount: number
  hasBreakingChanges: boolean
}

export type NavItem = {
  label: string
  href: string
  docType: string
  active: boolean
}

// ---------------------------------------------------------------------------
// Load all doc paths
// ---------------------------------------------------------------------------

/**
 * Load all documentation entries from services/ directory.
 */
export async function getAllDocPaths(): Promise<DocEntry[]> {
  if (!existsSync(SERVICES_DIR)) return []

  const htmlFiles = await glob(join(SERVICES_DIR, "**/*.html"))
  const entries: DocEntry[] = []

  for (const file of htmlFiles) {
    const relativePath = relative(SERVICES_DIR, file)
    const parts = relativePath.split("/")

    // Expected: {service}/{docType}/{entity}.html
    if (parts.length < 3) continue

    const service = parts[0]
    const docType = parts[1]
    const entity = parts[2].replace(".html", "")

    // Load metadata if available
    const metaFiles = await glob(join(SERVICES_DIR, service, "_meta-*.json"))
    let meta: Record<string, unknown> = {}
    for (const metaFile of metaFiles) {
      const metaEntries = JSON.parse(readFileSync(metaFile, "utf-8"))
      const match = metaEntries.find(
        (e: Record<string, unknown>) => e.outputPath === relativePath,
      )
      if (match) {
        meta = match
        break
      }
    }

    entries.push({
      slug: relativePath.replace(".html", ""),
      service,
      docType,
      entity: (meta.entity as string) || entity,
      html: readFileSync(file, "utf-8"),
      hasBreakingChanges: (meta.hasBreakingChanges as boolean) || false,
      generatedAt: (meta.generatedAt as string) || "",
      sourceRepo: (meta.sourceRepo as string) || "",
      sourcePr: (meta.sourcePr as number) || 0,
      sourcePrUrl: meta.sourceRepo
        ? `https://github.com/${meta.sourceRepo}/pull/${meta.sourcePr}`
        : "",
    })
  }

  return entries
}

// ---------------------------------------------------------------------------
// Load service summaries
// ---------------------------------------------------------------------------

/**
 * Load summary for all services.
 */
export async function loadAllServices(): Promise<ServiceSummary[]> {
  if (!existsSync(SERVICES_DIR)) return []

  const serviceDirs = readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const summaries: ServiceSummary[] = []

  for (const service of serviceDirs) {
    const serviceDir = join(SERVICES_DIR, service)

    const count = (subdir: string) => {
      const dir = join(serviceDir, subdir)
      if (!existsSync(dir)) return 0
      return readdirSync(dir).filter((f) => f.endsWith(".html")).length
    }

    // Check for breaking changes in any metadata
    const metaFiles = await glob(join(serviceDir, "_meta-*.json"))
    const hasBreaking = metaFiles.some((f) => {
      const metaEntries = JSON.parse(readFileSync(f, "utf-8"))
      return metaEntries.some(
        (e: Record<string, unknown>) => e.hasBreakingChanges,
      )
    })

    summaries.push({
      name: service,
      type: "backend",
      apiCount: count("api"),
      modelCount: count("models"),
      eventCount: count("events"),
      flowCount: count("flows"),
      hasBreakingChanges: hasBreaking,
    })
  }

  return summaries
}

// ---------------------------------------------------------------------------
// Load recent changes
// ---------------------------------------------------------------------------

/**
 * Load the N most recent documentation changes across all services.
 */
export async function loadRecentChanges(
  limit: number = 10,
): Promise<DocEntry[]> {
  const all = await getAllDocPaths()
  return all
    .filter((d) => d.generatedAt)
    .sort(
      (a, b) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    )
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Load navigation for a service
// ---------------------------------------------------------------------------

/**
 * Build navigation items for a specific service.
 */
export async function loadServiceNav(
  service: string,
  currentSlug: string = "",
): Promise<NavItem[]> {
  const all = await getAllDocPaths()
  return all
    .filter((d) => d.service === service)
    .map((d) => ({
      label: d.entity,
      href: `/${d.slug}`,
      docType: d.docType,
      active: d.slug === currentSlug,
    }))
}
