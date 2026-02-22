# Astro Documentation Site

**Duration:** 4-5 days
**Dependencies:** Phase 1 (contracts — defines HTML structure), Phase 6 (HTML files exist in services/)
**Outcome:** A live, searchable, interactive documentation site built with Astro

---

## Objective

Build a static documentation site using Astro that:

- Auto-discovers all generated HTML in `services/`
- Provides navigation by service, doc type, and entity
- Highlights breaking changes prominently
- Visualizes cross-service flows
- Includes client-side search
- Rebuilds and deploys on every merge to `main`

---

## Project Structure

```
site/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── public/
│   └── favicon.svg
└── src/
    ├── layouts/
    │   └── DocsLayout.astro          # Main layout with sidebar nav
    ├── pages/
    │   ├── index.astro               # Dashboard / landing page
    │   ├── [...slug].astro           # Dynamic route for all doc pages
    │   └── search.astro              # Search results page
    ├── components/
    │   ├── ServiceNav.astro          # Left sidebar: service list
    │   ├── DocTypeNav.astro          # Sub-nav: api/models/events/flows
    │   ├── FlowDiagram.astro         # Visual flow rendering
    │   ├── BreakingBadge.astro       # Red badge for breaking changes
    │   ├── SearchBar.astro           # Search input (client-side)
    │   ├── ChangeTimeline.astro      # Recent changes timeline
    │   └── ServiceCard.astro         # Service overview card for dashboard
    ├── utils/
    │   ├── docs-loader.ts            # Load & parse services/ directory
    │   ├── flow-detector.ts          # Cross-reference flows at build time
    │   └── search-index.ts           # Build search index
    └── styles/
        ├── global.css                # Base styles + CSS variables
        ├── docs.css                  # Documentation content styles
        └── components.css            # Component-specific styles
```

---

## Configuration

### `astro.config.mjs`

```javascript
import { defineConfig } from "astro/config"

export default defineConfig({
  // Adjust based on hosting
  site: "https://docs.your-org.com",

  // No JS shipped by default (static HTML)
  output: "static",

  // Build output goes to dist/
  outDir: "./dist",

  // Enable view transitions for smooth navigation
  experimental: {
    viewTransitions: true,
  },
})
```

### `package.json`

```json
{
  "name": "@company/docs-site",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^4.0.0"
  },
  "devDependencies": {
    "pagefind": "^1.0.0"
  }
}
```

---

## Key Pages

### Dashboard (`pages/index.astro`)

```astro
---
import DocsLayout from "../layouts/DocsLayout.astro"
import ServiceCard from "../components/ServiceCard.astro"
import ChangeTimeline from "../components/ChangeTimeline.astro"
import { loadAllServices, loadRecentChanges } from "../utils/docs-loader"

const services = await loadAllServices()
const recentChanges = await loadRecentChanges(10)
---

<DocsLayout title="Documentation Hub">
  <main>
    <section class="hero">
      <h1>Documentation Hub</h1>
      <p>Auto-generated documentation from source code. Always up-to-date.</p>
    </section>

    <section class="services-grid">
      <h2>Services</h2>
      <div class="grid">
        {services.map(service => (
          <ServiceCard
            name={service.name}
            type={service.type}
            apiCount={service.apiCount}
            modelCount={service.modelCount}
            hasBreakingChanges={service.hasBreakingChanges}
          />
        ))}
      </div>
    </section>

    <section class="recent-changes">
      <h2>Recent Changes</h2>
      <ChangeTimeline changes={recentChanges} />
    </section>
  </main>
</DocsLayout>
```

### Dynamic Doc Page (`pages/[...slug].astro`)

```astro
---
import DocsLayout from "../layouts/DocsLayout.astro"
import BreakingBadge from "../components/BreakingBadge.astro"
import { loadDocBySlug, loadServiceNav } from "../utils/docs-loader"

export async function getStaticPaths() {
  const { getAllDocPaths } from "../utils/docs-loader"
  const paths = await getAllDocPaths()

  return paths.map(doc => ({
    params: { slug: doc.slug },
    props: { doc },
  }))
}

const { doc } = Astro.props
const nav = await loadServiceNav(doc.service)
---

<DocsLayout title={`${doc.entity} - ${doc.service}`}>
  <div class="doc-page">
    <aside class="doc-sidebar">
      <ServiceNav items={nav} current={doc.slug} />
    </aside>

    <article class="doc-content">
      <header>
        <div class="doc-breadcrumb">
          <a href="/">Home</a> /
          <a href={`/${doc.service}`}>{doc.service}</a> /
          <span>{doc.docType}</span>
        </div>

        <h1>
          {doc.entity}
          {doc.hasBreakingChanges && <BreakingBadge />}
        </h1>

        <div class="doc-meta">
          <span>Source: <a href={doc.sourcePrUrl}>{doc.sourceRepo} PR #{doc.sourcePr}</a></span>
          <span>Updated: {doc.generatedAt}</span>
        </div>
      </header>

      <!-- Inject the generated HTML fragment -->
      <div class="doc-body" set:html={doc.html} />
    </article>
  </div>
</DocsLayout>
```

---

## Docs Loader (`utils/docs-loader.ts`)

```typescript
import { readFileSync, readdirSync, existsSync } from "fs"
import { join, relative } from "path"
import { glob } from "glob"

const SERVICES_DIR = join(process.cwd(), "..", "services")

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

/**
 * Load all documentation entries from services/ directory.
 */
export async function getAllDocPaths(): Promise<DocEntry[]> {
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
    let meta: any = {}
    for (const metaFile of metaFiles) {
      const entries = JSON.parse(readFileSync(metaFile, "utf-8"))
      const match = entries.find((e: any) => e.outputPath === relativePath)
      if (match) {
        meta = match
        break
      }
    }

    entries.push({
      slug: relativePath.replace(".html", ""),
      service,
      docType,
      entity: meta.entity || entity,
      html: readFileSync(file, "utf-8"),
      hasBreakingChanges: meta.hasBreakingChanges || false,
      generatedAt: meta.generatedAt || "",
      sourceRepo: meta.sourceRepo || "",
      sourcePr: meta.sourcePr || 0,
      sourcePrUrl: `https://github.com/${meta.sourceRepo}/pull/${meta.sourcePr}`,
    })
  }

  return entries
}

/**
 * Load summary for all services.
 */
export async function loadAllServices(): Promise<ServiceSummary[]> {
  const serviceDirs = readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)

  const summaries: ServiceSummary[] = []

  for (const service of serviceDirs) {
    const serviceDir = join(SERVICES_DIR, service)

    const count = (subdir: string) => {
      const dir = join(serviceDir, subdir)
      if (!existsSync(dir)) return 0
      return readdirSync(dir).filter(f => f.endsWith(".html")).length
    }

    // Check for breaking changes in any metadata
    const metaFiles = await glob(join(serviceDir, "_meta-*.json"))
    const hasBreaking = metaFiles.some(f => {
      const entries = JSON.parse(readFileSync(f, "utf-8"))
      return entries.some((e: any) => e.hasBreakingChanges)
    })

    summaries.push({
      name: service,
      type: "backend", // Could read from registry.json
      apiCount: count("api"),
      modelCount: count("models"),
      eventCount: count("events"),
      flowCount: count("flows"),
      hasBreakingChanges: hasBreaking,
    })
  }

  return summaries
}
```

---

## Styling

### `styles/global.css`

```css
:root {
  --color-bg: #ffffff;
  --color-surface: #f8f9fa;
  --color-border: #e1e4e8;
  --color-text: #24292e;
  --color-text-secondary: #586069;
  --color-primary: #0366d6;
  --color-success: #28a745;
  --color-warning: #f9a825;
  --color-danger: #d73a49;
  --color-breaking: #d73a49;

  --sidebar-width: 260px;
  --content-max-width: 900px;

  --font-mono: "JetBrains Mono", "Fira Code", monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* Documentation content styles */
.doc-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.doc-body th, .doc-body td {
  border: 1px solid var(--color-border);
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.doc-body code {
  background: var(--color-surface);
  padding: 0.15rem 0.3rem;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.875em;
}

.doc-body pre {
  background: var(--color-surface);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
}

/* Breaking change badges */
.badge-breaking {
  display: inline-block;
  background: var(--color-breaking);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 3px;
  text-transform: uppercase;
}

/* Method badges */
.method-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-weight: 600;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.method-get { background: #61affe; color: white; }
.method-post { background: #49cc90; color: white; }
.method-put { background: #fca130; color: white; }
.method-patch { background: #50e3c2; color: white; }
.method-delete { background: #f93e3e; color: white; }
```

---

## Search Integration

Using Pagefind (built specifically for static sites):

### Build step

```json
{
  "scripts": {
    "build": "astro build && npx pagefind --site dist"
  }
}
```

Pagefind indexes the built HTML and provides a lightweight client-side search widget. Zero server-side infrastructure needed.

---

## Build & Deploy Workflow

### `.github/workflows/build-site.yml`

```yaml
name: Build & Deploy Documentation Site
on:
  push:
    branches: [main]
    paths:
      - "services/**"
      - "site/**"

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --filter @company/docs-site

      - name: Build Astro site
        working-directory: site
        run: pnpm build

      - name: Upload to GitHub Pages
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## Acceptance Criteria

- [ ] Astro project scaffolded and builds successfully
- [ ] Dashboard page lists all services with counts
- [ ] Dynamic pages render HTML fragments from `services/`
- [ ] Breaking change badges display on affected pages
- [ ] Sidebar navigation works by service and doc type
- [ ] Pagefind search indexes all documentation
- [ ] Site rebuilds on push to main (services/ or site/ changes)
- [ ] Deployed to GitHub Pages (or equivalent)
