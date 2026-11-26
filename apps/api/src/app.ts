import { JobRequest } from "@jobs/shared";
import express, { type Express } from "express";
import { rateLimit } from "express-rate-limit";

interface ReadinessClient {
  query(statement: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

interface DatabasePool {
  connect(): Promise<ReadinessClient>;
  query(statement: string, values: string[]): Promise<{ rows: { id: string; status: string }[] }>;
}

const readinessQueryTimeoutMs = 5_000;

export function createApp(pool: DatabasePool): Express {
  const app: Express = express();

  // Allow a maximum-length CSV even when its characters require JSON escapes.
  app.post("/jobs", express.json({ limit: "2mb", strict: false }), async (request, response) => {
    const job = JobRequest.safeParse(request.body);
    if (!job.success) {
      response.status(400).json({ errors: job.error.issues });
      return;
    }

    try {
      const { rows } = await pool.query(
        "INSERT INTO jobs (type, payload, status) VALUES ($1, $2, 'pending') RETURNING id, status",
        [job.data.type, JSON.stringify(job.data.payload)],
      );
      const [{ id, status }] = rows;
      response.status(202).json({ id, status });
    } catch {
      response.status(500).json({ error: "Failed to create job" });
    }
  });

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
