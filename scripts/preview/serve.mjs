/** Development-only web preview; the extension never ships the browser shim. */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve(new URL("../..", import.meta.url).pathname);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://preview").pathname,
      );
      const file = resolve(
        root,
        "." + (pathname === "/" ? "/newtab.html" : pathname),
      );
      if (
        !file.startsWith(root + "/") ||
        pathname.includes("/.") ||
        pathname.includes("node_modules")
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      let content = await readFile(file);
      if (file.endsWith("/newtab.html"))
        content = Buffer.from(
          content
            .toString()
            .replace(
              '<script src="js/newtab.js">',
              '<script src="scripts/preview/browser-api.js"></script><script src="js/newtab.js">',
            ),
        );
      res.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT ?? 4173), "0.0.0.0", () =>
    console.log("New tab preview: port " + (process.env.PORT ?? 4173)),
  );
