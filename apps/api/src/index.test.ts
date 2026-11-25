import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { connect, query, release } = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./database.js", () => ({
  pool: { connect },
}));

import { app } from "./index.js";

describe("API endpoints", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    query.mockReset();
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

  it("returns 503 and destroys the connection when the readiness query times out", async () => {
    let rejectQuery: ((error: Error) => void) | undefined;
    query.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectQuery = reject;
        }),
    );
    release.mockImplementationOnce((destroy: boolean) => {
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
