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

  function postJob(body: unknown) {
    return fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    const app = createApp({ connect, query: insertJob });
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
    await response.text();

    expect(response.status).toBe(413);
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

  it("returns a generic 500 response when inserting a job fails", async () => {
    insertJob.mockRejectedValueOnce(new Error("database details"));

    const response = await postJob(sumJob);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to create job" });
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
