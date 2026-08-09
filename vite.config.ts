import { defineConfig } from "vite";

export default defineConfig({
  // Relative URLs make the built manifest work on both a GitHub Pages project site
  // (https://owner.github.io/repository/) and a custom domain.
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: "index.html",
        plugin: "src/plugin.ts"
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "plugin" ? "plugin.js" : "assets/[name]-[hash].js")
      }
    }
  },
  server: { port: 4400 },
  preview: { port: 4400 }
});
