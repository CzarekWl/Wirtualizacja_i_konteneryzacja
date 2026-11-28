import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

interface TestClient {
  query(statement: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

describe("API endpoints", () => {
  let server: Server;
  let baseUrl: string;
  const query = vi.fn<(statement: string) => Promise<unknown>>();
  const insertJob =
    vi.fn<
      (statement: string, values: string[]) => Promise<{ rows: { id: string; status: string }[] }>
    >();
  const release = vi.fn<(destroy?: boolean) => void>();
  const connect = vi.fn<() => Promise<TestClient>>();
  const sumJob = { type: "sum", payload: { numbers: [1, 2] } };
  const createdJob = { id: "94c1923a-5361-4230-9904-5949ec415ad4", status: "pending" };
  const fullJob = {
    id: createdJob.id,
    type: "sum",
    payload: { numbers: [1, 2] },
    status: "completed",
    result: { sum: 3 },
    error: null,
    attempts: 1,
    created_at: new Date("2026-11-27T10:00:00.000Z"),
    started_at: new Date("2026-11-27T10:01:00.000Z"),
    finished_at: new Date("2026-11-27T10:02:00.000Z"),
  };

  function postJob(body: unknown) {
    return fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function getJob(id: string) {
    return fetch(`${baseUrl}/jobs/${id}`);
  }

  beforeAll(async () => {
    const app = createApp({ connect, query: insertJob });
    app.set("env", "production");
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    query.mockReset();
    insertJob.mockReset().mockResolvedValue({ rows: [createdJob] });
    release.mockReset();
    connect.mockReset().mockResolvedValue({ query, release });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("returns 200 and the expected JSON from /health", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).toBe('{"status":"ok"}');
  });

  it("inserts a pending job with parameterized values and returns 202", async () => {
    const response = await postJob(sumJob);

    expect(insertJob).toHaveBeenCalledExactlyOnceWith(
      "INSERT INTO jobs (type, payload, status) VALUES ($1, $2, 'pending') RETURNING id, status",
      ["sum", JSON.stringify(sumJob.payload)],
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(createdJob);
  });

  it("accepts a maximum-length CSV that exceeds the default JSON limit", async () => {
    const payload = { csv: "☃".repeat(200_000) };
    const response = await postJob({ type: "csv_stats", payload });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(createdJob);
    expect(insertJob.mock.calls[0]?.[1]).toEqual(["csv_stats", JSON.stringify(payload)]);
  });

  it("returns 413 without querying the database when the JSON body exceeds the route limit", async () => {
    const response = await postJob({ type: "csv_stats", payload: { csv: "x".repeat(2_097_152) } });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "Request body too large" });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it("returns safe JSON for malformed JSON without logging request content", async () => {
    using warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await fetch(`${baseUrl}/jobs?token=private-query-value`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"password":"private-body-value",}',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Invalid request body" });
    expect(warning).toHaveBeenCalledExactlyOnceWith("Invalid request body", {
      method: "POST",
      route: "/jobs",
      status: 400,
    });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it("returns JSON for an unsupported request body encoding", async () => {
    const response = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=iso-8859-1" },
      body: JSON.stringify(sumJob),
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Unsupported request body encoding" });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it("returns 400 with Zod validation errors without querying the database", async () => {
    const response = await postJob({ type: "sum", payload: { numbers: [] } });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errors: [{ code: "too_small", path: ["payload", "numbers"] }],
    });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it.each([
    ["a NUL character", "name\nA\u0000B"],
    ["an unpaired high surrogate", "name\n\uD83D"],
    ["an unpaired low surrogate", "name\n\uDE00"],
  ])("rejects CSV containing %s before querying the database", async (_description, csv) => {
    const response = await postJob({ type: "csv_stats", payload: { csv } });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      errors: [{ code: "custom", path: ["payload", "csv"] }],
    });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it("accepts CSV containing an emoji and passes it to the database unchanged", async () => {
    const payload = { csv: "name\n😀" };
    const response = await postJob({ type: "csv_stats", payload });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(createdJob);
    expect(insertJob).toHaveBeenCalledTimes(1);
    expect(insertJob.mock.calls[0]?.[1]).toEqual(["csv_stats", JSON.stringify(payload)]);
  });

  it("returns a generic 500 response when inserting a job fails", async () => {
    using logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const databaseError = Object.assign(new Error("private database details"), { status: 400 });
    insertJob.mockRejectedValueOnce(databaseError);

    const response = await postJob(sumJob);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Failed to create job" });
    expect(logError).toHaveBeenCalledExactlyOnceWith("Failed to create job", {
      method: "POST",
      route: "/jobs",
      status: 500,
    });
  });

  it("returns the full job record for an existing job", async () => {
    insertJob.mockResolvedValueOnce({ rows: [fullJob] });

    const response = await getJob(fullJob.id);

    expect(insertJob).toHaveBeenCalledExactlyOnceWith("SELECT * FROM jobs WHERE id = $1", [
      fullJob.id,
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...fullJob,
      created_at: fullJob.created_at.toISOString(),
      started_at: fullJob.started_at.toISOString(),
      finished_at: fullJob.finished_at.toISOString(),
    });
  });

  it("returns 400 for a malformed job ID without querying the database", async () => {
    const response = await getJob("not-a-uuid");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid job ID" });
    expect(insertJob).not.toHaveBeenCalled();
  });

  it("returns 404 for a valid job ID that does not exist", async () => {
    insertJob.mockResolvedValueOnce({ rows: [] });

    const response = await getJob("550e8400-e29b-41d4-a716-446655440000");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Job not found" });
  });

  it("returns a generic 500 response when retrieving a job fails", async () => {
    using logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const databaseError = Object.assign(new Error("database credentials must not be exposed"), {
      status: 400,
    });
    insertJob.mockRejectedValueOnce(databaseError);

    const response = await getJob(fullJob.id);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toBe('{"error":"Failed to retrieve job"}');
    expect(logError).toHaveBeenCalledExactlyOnceWith("Failed to retrieve job", {
      method: "GET",
      route: "/jobs/:id",
      status: 500,
    });
  });

  it("returns 200 when the database readiness query succeeds", async () => {
    query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(query).toHaveBeenCalledWith("SELECT 1");
    expect(release).toHaveBeenCalledWith(false);
  });

  it("returns a generic 503 response when the database readiness query fails", async () => {
    query.mockRejectedValueOnce(new Error("database credentials must not be exposed"));

    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"error","database":"unavailable"}');
    expect(body).not.toContain("credentials");
    expect(release).toHaveBeenCalledWith(false);
  });

  it("logs only safe details when releasing a client fails after sending headers", async () => {
    using logError = vi.spyOn(console, "error").mockImplementation(() => {});
    release.mockImplementationOnce(() => {
      throw new Error("private database details");
    });

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    await vi.waitFor(() => {
      expect(logError).toHaveBeenNthCalledWith(1, "Request failed after headers were sent", {
        method: "GET",
        route: "/health/ready",
        status: 200,
      });
      expect(logError).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ message: "Internal server error", stack: undefined }),
      );
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain("private database details");
  });

  it("returns 503 when acquiring a database client fails", async () => {
    connect.mockRejectedValueOnce(new Error("database connection failed"));

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error", database: "unavailable" });
    expect(query).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  it("returns 503 and destroys the connection when the readiness query times out", async () => {
    let rejectQuery: ((error: Error) => void) | undefined;
    query.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectQuery = reject;
        }),
    );
    release.mockImplementationOnce((destroy?: boolean) => {
      if (destroy) {
        rejectQuery?.(new Error("client destroyed after query timeout"));
      }
    });

    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"error","database":"unavailable"}');
    expect(release).toHaveBeenCalledWith(true);
  }, 10_000);

  it("returns 404 and JSON for an unknown route", async () => {
    const response = await fetch(`${baseUrl}/unknown-route`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});
