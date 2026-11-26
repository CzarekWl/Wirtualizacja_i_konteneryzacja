import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

interface TestClient {
  query(statement: string): Promise<unknown>;
  release(destroy?: boolean): void;
}

describe("API readiness rate limit", () => {
  let server: Server;
  let baseUrl: string;
  const query = vi.fn<(statement: string) => Promise<unknown>>();
  const release = vi.fn<(destroy?: boolean) => void>();
  const connect = vi.fn<() => Promise<TestClient>>();

  beforeAll(async () => {
    connect.mockResolvedValue({ query, release });
    const app = createApp({ connect });
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
});
