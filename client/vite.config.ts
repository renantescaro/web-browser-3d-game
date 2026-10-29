import { defineConfig } from "vite";
import { SERVER_PORT } from "@jogo/shared/constants";

export default defineConfig({
  build: {
    // O Rapier (-compat) embute o WASM no JS, então o bundle passa de 2 MB mesmo.
    chunkSizeWarningLimit: 3000,
  },
  server: {
    port: 5173,
    strictPort: true,
    // Em desenvolvimento, o Socket.IO passa pelo Vite e chega ao servidor na porta 3000.
    proxy: {
      "/socket.io": { target: `http://localhost:${SERVER_PORT}`, ws: true },
    },
  },
});
