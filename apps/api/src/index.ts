import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import { SHARED_PACKAGE_NAME } from "@jobs/shared";
import { createApp } from "./app.js";
import { createPool } from "./database.js";

export { SHARED_PACKAGE_NAME };
export const SERVICE_NAME = "@jobs/api";

export function startServer() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = createPool(connectionString);
  const app = createApp(pool);
  const port = Number(process.env.PORT ?? 3000);
  const server = app.listen(port, () => {
    console.info(`API listening on port ${port}`);
  });

  let isShuttingDown = false;
  const shutdown = () => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    server.close((error) => {
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

  return { server, pool, shutdown };
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

let server: Server | undefined;
if (isMainModule) {
  server = startServer().server;
}

export { server };
