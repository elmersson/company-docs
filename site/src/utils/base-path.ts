/**
 * Prefix a path with the configured Astro base URL.
 *
 * import.meta.env.BASE_URL is "/company-docs/" in production (with trailing
 * slash) and "/" in dev. This helper normalises it so callers can just write
 * `base("/loan-api/api")` and get `/company-docs/loan-api/api`.
 */
export function base(path: string): string {
  const b = import.meta.env.BASE_URL.replace(/\/$/, "")
  const p = path.startsWith("/") ? path : `/${path}`
  return `${b}${p}`
}
