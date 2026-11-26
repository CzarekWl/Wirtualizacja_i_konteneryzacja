import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

interface TestClient {
  query(statement: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

describe("API rate limits", () => {
  let server: Server;
  let baseUrl: string;
  const query = vi.fn<(statement: string) => Promise<unknown>>();
  const insertJob = vi.fn().mockResolvedValue({
    rows: [{ id: "94c1923a-5361-4230-9904-5949ec415ad4", status: "pending" }],
  });
  const release = vi.fn<(destroy?: boolean) => void>();
  const connect = vi.fn<() => Promise<TestClient>>();

  beforeAll(async () => {
    connect.mockResolvedValue({ query, release });
    const app = createApp({ connect, query: insertJob });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("limits readiness requests and stops querying the database after the limit", async () => {
    for (let request = 0; request < 30; request += 1) {
      const response = await fetch(`${baseUrl}/health/ready`);
      expect(response.status).toBe(200);
    }

    const limitedResponse = await fetch(`${baseUrl}/health/ready`);

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("ratelimit")).toBeTruthy();
    expect(await limitedResponse.json()).toEqual({ error: "Too many requests" });
    expect(query).toHaveBeenCalledTimes(30);
  });

  it("limits job submissions before parsing the body or querying the database", async () => {
    const body = JSON.stringify({ type: "sum", payload: { numbers: [1, 2] } });
    const postJob = (body: string) =>
      fetch(`${baseUrl}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

    for (let request = 0; request < 30; request += 1) {
      const response = await postJob(body);
      expect(response.status).toBe(202);
      await response.text();
    }

    const limitedResponse = await postJob(body);
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("ratelimit")).toBeTruthy();
    expect(limitedResponse.headers.get("retry-after")).toBeTruthy();
    expect(await limitedResponse.json()).toEqual({ error: "Too many requests" });

    const malformedResponse = await postJob("{");
    expect(malformedResponse.status).toBe(429);
    await malformedResponse.text();
    expect(insertJob).toHaveBeenCalledTimes(30);
  });
});
