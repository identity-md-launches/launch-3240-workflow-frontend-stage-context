import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(new URL("../../dist", import.meta.url).pathname);
export const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname.replace(/^\/preview\//, "/"));
  const file = path.resolve(root, "." + (p === "/" ? "/index.html" : p));
  if (
    !file.startsWith(root + "/") ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    "Content-Type":
      {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[ext] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
});
server.listen(Number(process.argv[2] ?? 4173), "0.0.0.0", () =>
  console.log("Static preview ready"),
);
