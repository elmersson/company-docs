import { readFileSync, readdirSync, existsSync } from "fs"
import { join, relative } from "path"
import { glob } from "glob"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICES_DIR = join(process.cwd(), "..", "services")
const REGISTRY_PATH = join(process.cwd(), "..", "registry.json")

type RegistryEntry = {
  name: string
  type: "backend" | "frontend"
}

type Registry = {
  services: RegistryEntry[]
}

function loadRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) return { services: [] }
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as Registry
}

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
  apiCallCount: number
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

export type DocTypeListing = {
  service: string
  docType: string
  entities: DocListingEntry[]
}

export type DocListingEntry = {
  entity: string
  slug: string
  hasBreakingChanges: boolean
  generatedAt: string
  sourceRepo: string
  sourcePr: number
  sourcePrUrl: string
}

export type OverviewPath = {
  service: string
  docType: string
  availableDocTypes: string[]
}

export type ConsumerInfo = {
  service: string
  slug: string
  entity: string
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

  const registry = loadRegistry()
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

    // Look up service type from registry, default to "backend"
    const registryEntry = registry.services.find((s) => s.name === service)
    const serviceType = registryEntry?.type || "backend"

    summaries.push({
      name: service,
      type: serviceType,
      apiCount: count("api"),
      apiCallCount: count("api-calls"),
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

// ---------------------------------------------------------------------------
// Overview / listing pages
// ---------------------------------------------------------------------------

/**
 * Get all {service}/{docType} combinations that have at least one doc entry.
 * Used by the overview page's getStaticPaths().
 */
export async function getOverviewPaths(): Promise<OverviewPath[]> {
  const all = await getAllDocPaths()

  // Build a map of service -> Set<docType>
  const serviceDocTypes = new Map<string, Set<string>>()
  for (const entry of all) {
    if (!serviceDocTypes.has(entry.service)) {
      serviceDocTypes.set(entry.service, new Set())
    }
    serviceDocTypes.get(entry.service)!.add(entry.docType)
  }

  const paths: OverviewPath[] = []
  for (const [service, docTypes] of serviceDocTypes) {
    const available = Array.from(docTypes)
    for (const docType of available) {
      paths.push({ service, docType, availableDocTypes: available })
    }
  }

  return paths
}

/**
 * Load all doc entries for a specific service + docType, without full HTML.
 */
export async function loadDocTypeListing(
  service: string,
  docType: string,
): Promise<DocTypeListing> {
  const all = await getAllDocPaths()
  const filtered = all.filter(
    (d) => d.service === service && d.docType === docType,
  )

  return {
    service,
    docType,
    entities: filtered.map((d) => ({
      entity: d.entity,
      slug: d.slug,
      hasBreakingChanges: d.hasBreakingChanges,
      generatedAt: d.generatedAt,
      sourceRepo: d.sourceRepo,
      sourcePr: d.sourcePr,
      sourcePrUrl: d.sourcePrUrl,
    })),
  }
}

/**
 * Get the list of doc types that have content for a given service.
 */
export async function getServiceDocTypes(service: string): Promise<string[]> {
  const all = await getAllDocPaths()
  const docTypes = new Set<string>()
  for (const entry of all) {
    if (entry.service === service) {
      docTypes.add(entry.docType)
    }
  }
  return Array.from(docTypes)
}

// ---------------------------------------------------------------------------
// Consumer lookup (backend -> frontend linking)
// ---------------------------------------------------------------------------

/**
 * Find frontend services that consume a backend API endpoint.
 *
 * Matches by filename: given slug "loan-api/api/get-loans", extracts the
 * filename portion "get-loans" and finds all api-calls entries across other
 * services with the same filename.
 */
export async function loadConsumers(slug: string): Promise<ConsumerInfo[]> {
  const parts = slug.split("/")
  if (parts.length < 3) return []

  const [service, docType, ...rest] = parts
  // Only look up consumers for backend API endpoints
  if (docType !== "api") return []

  const filename = rest.join("/")
  const all = await getAllDocPaths()

  return all
    .filter((d) => {
      if (d.service === service) return false
      if (d.docType !== "api-calls") return false
      // Extract filename from the entry's slug: "{service}/api-calls/{filename}"
      const entryParts = d.slug.split("/")
      const entryFilename = entryParts.slice(2).join("/")
      return entryFilename === filename
    })
    .map((d) => ({
      service: d.service,
      slug: d.slug,
      entity: d.entity,
    }))
}
