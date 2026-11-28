import { JobId, JobRequest } from "@jobs/shared";
import express, { type ErrorRequestHandler, type Express } from "express";

interface ReadinessClient {
  query(statement: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

interface DatabasePool {
  connect(): Promise<ReadinessClient>;
  query(
    statement: string,
    values: string[],
  ): Promise<{ rows: { id: string; status: string; [field: string]: unknown }[] }>;
}

const readinessQueryTimeoutMs = 5_000;

class JobCreationError extends Error {
  constructor(cause: unknown) {
    super("Failed to create job", { cause });
  }
}

const handleError: ErrorRequestHandler = (error: unknown, request, response, next) => {
  const route = (request.route as { path?: unknown } | undefined)?.path;
  const context = {
    method: request.method,
    route: typeof route === "string" ? route : undefined,
  };

  if (response.headersSent) {
    console.error("Request failed after headers were sent", {
      ...context,
      status: response.statusCode,
    });
    next(Object.assign(new Error("Internal server error"), { stack: undefined }));
    return;
  }

  let status = 500;
  let message = "Internal server error";
  if (error instanceof JobCreationError) {
    message = error.message;
  } else if (error instanceof Error && "status" in error) {
    switch (error.status) {
      case 400:
        status = 400;
        message = "Invalid request body";
        break;
      case 413:
        status = 413;
        message = "Request body too large";
        break;
      case 415:
        status = 415;
        message = "Unsupported request body encoding";
        break;
    }
  }

  if (status >= 500) {
    console.error(message, { ...context, status });
  } else {
    console.warn(message, { ...context, status });
  }
  response.status(status).json({ error: message });
};

export function createApp(pool: DatabasePool): Express {
  const app: Express = express();

  app.post(
    "/jobs",
    // Allow a maximum-length CSV even when its characters require JSON escapes.
    express.json({ limit: "2mb", strict: false }),
    async (request, response) => {
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
      } catch (error) {
        throw new JobCreationError(error);
      }
    },
  );

  app.get("/jobs/:id", async (request, response) => {
    const id = JobId.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ error: "Invalid job ID" });
      return;
    }

    try {
      const { rows } = await pool.query("SELECT * FROM jobs WHERE id = $1", [id.data]);
      const [job] = rows;
      if (!job) {
        response.status(404).json({ error: "Job not found" });
        return;
      }

      response.status(200).json(job);
    } catch {
      response.status(500).json({ error: "Failed to retrieve job" });
    }
  });

  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", async (_request, response) => {
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
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  app.use(handleError);

  return app;
}
