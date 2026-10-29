import { defineConfig } from "vite";

// Build de produção do servidor: empacota o código (incluindo @jogo/shared) em dist/index.js.
export default defineConfig({
  build: {
    ssr: "src/index.ts",
    outDir: "dist",
    target: "node20",
    emptyOutDir: true,
  },
  ssr: {
    noExternal: ["@jogo/shared"],
  },
});
