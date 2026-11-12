import { defineConfig } from "vite";
import fs from "node:fs";
export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "runtime-deployment-manifest",
      configureServer(server) {
        server.middlewares.use("/imd-deployment.json", (_req, res) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(
            fs.readFileSync(
              new URL("../dist/imd-deployment.json", import.meta.url),
            ),
          );
        });
      },
    },
  ],
  build: { outDir: "../dist", emptyOutDir: true, chunkSizeWarningLimit: 700 },
  server: { fs: { allow: [".."] } },
});
