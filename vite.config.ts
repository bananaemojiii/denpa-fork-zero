import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// BASE_PATH is set by the Pages workflow (/denpa-fork-zero/); local dev and any
// root-hosted deploy stay at "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: { port: 5173 },
});
