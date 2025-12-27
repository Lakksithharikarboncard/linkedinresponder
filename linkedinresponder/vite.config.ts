import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        window: resolve(__dirname, "window.html"),
        options: resolve(__dirname, "options.html"),
        background: resolve(__dirname, "src/background/background.ts"),
        content: resolve(__dirname, "src/content/content.ts")
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name][extname]",
        chunkFileNames: "chunks/[name]-[hash].js",
      }
    }
  },
  publicDir: "public"
});
