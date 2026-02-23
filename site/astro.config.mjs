import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://elmersson.github.io",
  base: "/company-docs",
  output: "static",
  outDir: "./dist",
})
