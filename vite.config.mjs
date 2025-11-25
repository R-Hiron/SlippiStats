import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "./src/frontend",
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    assetsDir: "assets"
  },
});
