import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

// __dirname replacement for ESM config files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  build: {
    // Use the same output folder your manifest reads from
    outDir: "dist-v1",

    // Do NOT delete dist-v1, because the normal build also writes popup/options/background there
    emptyOutDir: false,

    // Build as a library so we can force an IIFE output and a stable filename
    lib: {
      entry: path.resolve(__dirname, "src/content/content.ts"),
      name: "LinkedInAIResponderContent",
      formats: ["iife"],          // IMPORTANT: avoids top-level "import"
      fileName: () => "content.js"
    },

    // IMPORTANT: make sure there are NO extra chunks like ./chunks/settings-*.js
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },

    sourcemap: false,
    minify: true
  }
});