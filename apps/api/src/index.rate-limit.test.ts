import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

interface TestClient {
  query(statement: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

describe("API requests", () => {
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

  it("continues handling readiness requests beyond 30 requests", async () => {
    for (let request = 0; request < 31; request += 1) {
      const response = await fetch(`${baseUrl}/health/ready`);
      expect(response.status).toBe(200);
    }

    expect(query).toHaveBeenCalledTimes(31);
  });

  it("continues accepting job submissions beyond 30 requests", async () => {
    const body = JSON.stringify({ type: "sum", payload: { numbers: [1, 2] } });
    const postJob = (body: string) =>
      fetch(`${baseUrl}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });

    for (let request = 0; request < 31; request += 1) {
      const response = await postJob(body);
      expect(response.status).toBe(202);
      await response.text();
    }

    expect(insertJob).toHaveBeenCalledTimes(31);
  });

  it("continues looking up jobs beyond 30 requests", async () => {
    insertJob.mockClear();
    const jobId = "94c1923a-5361-4230-9904-5949ec415ad4";

    for (let request = 0; request < 31; request += 1) {
      const response = await fetch(`${baseUrl}/jobs/${jobId}`);
      expect(response.status).toBe(200);
      await response.text();
    }

    expect(insertJob).toHaveBeenCalledTimes(31);
  });
});
