import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite';
import { resolve } from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ CHANGE THIS VARIABLE TO RENAME YOUR BUILD FOLDER
const BUILD_DIR = "dist-v1"; 

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: BUILD_DIR, // ✅ Uses your custom name
    emptyOutDir: true, // Clears the folder before building
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
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
