import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { connect, query, release } = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./database.js", () => ({
  pool: { connect },
}));

import { app } from "./index.js";

describe("API readiness rate limit", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    connect.mockResolvedValue({ query, release });
  });

  beforeAll(async () => {
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
