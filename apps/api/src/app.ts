import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";

interface ReadinessClient {
  query(statement: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

interface ReadinessPool {
  connect(): Promise<ReadinessClient>;
}

const readinessQueryTimeoutMs = 5_000;

export function createApp(pool: ReadinessPool): Express {
  const app: Express = express();

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
      let client: ReadinessClient | undefined;
      let queryTimedOut = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;

      try {
        client = await pool.connect();
        await Promise.race([
          client.query("SELECT 1"),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              queryTimedOut = true;
              reject(new Error("Readiness query timed out"));
            }, readinessQueryTimeoutMs);
          }),
        ]);
        response.status(200).json({ status: "ok" });
      } catch {
        response.status(503).json({ status: "error", database: "unavailable" });
      } finally {
        if (timeout) {
          clearTimeout(timeout);
        }
        client?.release(queryTimedOut);
      }
    },
  );

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  return app;
}
