import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { SHARED_PACKAGE_NAME } from "@jobs/shared";
import { pool } from "./database.js";

export { SHARED_PACKAGE_NAME };
export const SERVICE_NAME = "@jobs/api";

export const app: Express = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.get(
  "/health/ready",
  rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: "Too many requests" });
    },
  }),
  async (_request, response) => {
    try {
      await pool.query("SELECT 1");
      response.status(200).json({ status: "ok" });
    } catch {
      response.status(503).json({ status: "error", database: "unavailable" });
    }
  },
);

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

let server: Server | undefined;

if (isMainModule) {
  server = app.listen(port, () => {
    console.info(`API listening on port ${port}`);
  });

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    server?.close((error) => {
      if (error) {
        console.error("Failed to close API server");
        process.exitCode = 1;
      }

      void pool.end().catch(() => {
        console.error("Failed to close database connection pool");
        process.exitCode = 1;
      });
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export { server };
