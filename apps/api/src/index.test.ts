import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./database.js", () => ({
  pool: { query },
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
  });

  it("returns a generic 503 response when the database readiness query fails", async () => {
    query.mockRejectedValueOnce(new Error("database credentials must not be exposed"));

    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"status":"error","database":"unavailable"}');
    expect(body).not.toContain("credentials");
  });

  it("returns 404 and JSON for an unknown route", async () => {
    const response = await fetch(`${baseUrl}/unknown-route`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});
