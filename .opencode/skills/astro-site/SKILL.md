---
name: astro-site
description: Guide for building the Astro documentation site that renders auto-generated HTML fragments from the services directory with navigation, search, and flow diagrams.
---

## What I do

Help build the Astro static documentation site in `site/`. The site auto-discovers generated HTML in `services/`, provides navigation by service and doc type, highlights breaking changes, and includes client-side search via Pagefind.

## Project structure

```
site/
├── astro.config.mjs
├── package.json
├── tsconfig.json
└── src/
    ├── layouts/
    │   └── DocsLayout.astro         # Shell: sidebar + header + content slot
    ├── pages/
    │   ├── index.astro              # Dashboard: service cards + recent changes
    │   └── [...slug].astro          # Dynamic route: renders any doc page
    ├── components/
    │   ├── ServiceNav.astro         # Left sidebar navigation
    │   ├── DocTypeNav.astro         # Sub-nav tabs: api/models/events/flows
    │   ├── FlowDiagram.astro        # Visual flow rendering
    │   ├── BreakingBadge.astro      # Red breaking change badge
    │   ├── SearchBar.astro          # Pagefind search widget
    │   ├── ChangeTimeline.astro     # Recent changes list
    │   └── ServiceCard.astro        # Service overview card
    ├── utils/
    │   ├── docs-loader.ts           # Reads services/ directory at build time
    │   ├── flow-detector.ts         # Cross-references FE calls with BE routes
    │   └── search-index.ts          # Pagefind integration
    └── styles/
        ├── global.css               # CSS variables, base styles
        ├── docs.css                 # Content area: tables, code blocks, pre
        └── components.css           # Component-specific styles
```

## How the site works

1. At build time, `docs-loader.ts` reads all `.html` files from `services/`
2. It also reads `_meta-pr-{n}.json` files for metadata (entity name, doc type, breaking changes, source PR)
3. `getStaticPaths()` in `[...slug].astro` generates one page per HTML file
4. Each page injects the HTML fragment via `set:html={doc.html}`
5. Navigation is built from the directory structure: `services/{service}/{docType}/{entity}.html`

## Key Astro patterns

### Dynamic route with `getStaticPaths`

```astro
---
export async function getStaticPaths() {
  const docs = await getAllDocPaths()
  return docs.map(doc => ({
    params: { slug: doc.slug },
    props: { doc },
  }))
}
const { doc } = Astro.props
---
<div set:html={doc.html} />
```

### Reading services at build time

```typescript
// utils/docs-loader.ts
import { glob } from "glob"
import { readFileSync } from "fs"
import { join, relative } from "path"

const SERVICES_DIR = join(process.cwd(), "..", "services")

export async function getAllDocPaths() {
  const htmlFiles = await glob(join(SERVICES_DIR, "**/*.html"))
  return htmlFiles.map(file => {
    const rel = relative(SERVICES_DIR, file)
    const [service, docType, entity] = rel.split("/")
    return {
      slug: rel.replace(".html", ""),
      service,
      docType,
      entity: entity.replace(".html", ""),
      html: readFileSync(file, "utf-8"),
    }
  })
}
```

## CSS classes the site must support

These classes are used in Claude-generated HTML fragments:

```css
/* API docs */
.endpoint-title, .method-badge
.method-get, .method-post, .method-put, .method-patch, .method-delete

/* Model docs */
.model-title, .field-table, .badge-changed, .badge-removed

/* Event docs */
.event-title, .event-payload, .event-trigger

/* Flow docs */
.flow-title, .flow-steps, .flow-diagram

/* Breaking change docs */
.breaking-report, .breaking-item
.severity-critical, .severity-warning
.migration-guide
```

## Search

Use Pagefind for zero-infrastructure client-side search:

```json
{
  "scripts": {
    "build": "astro build && npx pagefind --site dist"
  }
}
```

## Deployment

Build and deploy via `.github/workflows/build-site.yml`:
- Trigger: push to main when `services/**` or `site/**` change
- Build: `pnpm build` in `site/`
- Deploy: `actions/upload-pages-artifact` + `actions/deploy-pages`

## Key rules

- Astro ships zero JS by default — keep it that way. No client-side frameworks.
- The site reads from `services/` one directory up (`../services` relative to `site/`)
- HTML fragments are injected as-is via `set:html` — the site does not transform them
- Every page must show: breadcrumb, entity name, breaking badge (if applicable), source PR link, generation timestamp
- Navigation must be auto-generated from the directory structure, not hardcoded

## When to use me

Use this skill when building the Astro site, adding components, fixing styles for generated HTML, or setting up the build/deploy pipeline.
