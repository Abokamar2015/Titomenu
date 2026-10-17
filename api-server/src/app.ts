import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// --- Production static serving (Railway / standalone deploy) ---
// When STATIC_DIR is set, serve the built frontend and add SPA fallback.
// admin.<domain> is rewritten to the /admin SPA route.
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const resolvedDir = path.resolve(staticDir);
  const indexHtml = path.join(resolvedDir, "index.html");

  if (!fs.existsSync(indexHtml)) {
    logger.warn({ resolvedDir }, "STATIC_DIR set but index.html not found");
  }

  // Host-based admin routing: admin.example.com/ -> /admin
  app.use((req, res, next) => {
    const host = (req.headers.host || "").toLowerCase();
    if (host.startsWith("admin.") && req.path === "/") {
      res.redirect(302, "/admin");
      return;
    }
    next();
  });

  app.use(express.static(resolvedDir, { maxAge: "1h", index: "index.html" }));

  // SPA fallback for client-side routes (e.g. /admin)
  app.get("*path", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
}

export default app;
