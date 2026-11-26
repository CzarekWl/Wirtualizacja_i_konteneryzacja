import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const { Pool, poolEnd, poolOn } = vi.hoisted(() => ({
  poolEnd: vi.fn<() => Promise<void>>().mockResolvedValue(),
  poolOn: vi.fn<(event: string, listener: (error: Error) => void) => void>(),
  Pool: vi.fn(
    class MockPool {
      on = poolOn;
      end = poolEnd;
    },
  ),
}));

vi.mock("pg", () => ({ Pool }));

import { startServer } from "./index.js";

const originalPort = process.env.PORT;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;

  if (originalPort === undefined) {
    delete process.env.PORT;
  } else {
    process.env.PORT = originalPort;
  }

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  vi.resetModules();
  vi.clearAllMocks();
});

describe("API server startup", () => {
  it("fails during entry point startup when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    process.argv = [
      process.argv[0] ?? "node",
      fileURLToPath(new URL("./index.ts", import.meta.url)),
    ];
    vi.resetModules();

    await expect(import("./index.js")).rejects.toThrow(
      "DATABASE_URL environment variable is required",
    );
    expect(Pool).not.toHaveBeenCalled();
  });

  it("fails clearly when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL;

    expect(() => startServer()).toThrow("DATABASE_URL environment variable is required");
    expect(Pool).not.toHaveBeenCalled();
  });

  it("creates one pool with DATABASE_URL and starts the server", async () => {
    process.env.PORT = "0";
    const connectionString = "postgresql://jobs:jobs@127.0.0.1:5432/jobs";
    process.env.DATABASE_URL = connectionString;

    const { server, shutdown } = startServer();

    expect(Pool).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledWith({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });

    if (!server.listening) {
      await new Promise<void>((resolve) => server.once("listening", resolve));
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(server.listening).toBe(true);

    const closed = new Promise<void>((resolve) => server.once("close", resolve));
    try {
      Reflect.apply(shutdown, process, []);
      Reflect.apply(shutdown, process, []);
      await closed;
    } finally {
      if (server.listening) {
        shutdown();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(poolEnd).toHaveBeenCalledTimes(1);
  });

  it("logs a server close failure and still closes the pool", async () => {
    process.env.PORT = "0";
    process.env.DATABASE_URL = "postgresql://jobs:jobs@127.0.0.1:5432/jobs";
    const { server, shutdown } = startServer();

    if (!server.listening) {
      await new Promise<void>((resolve) => server.once("listening", resolve));
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      shutdown();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(consoleError).toHaveBeenCalledWith("Failed to close API server");
      expect(poolEnd).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("logs a pool close failure and sets the process exit code", async () => {
    process.env.PORT = "0";
    process.env.DATABASE_URL = "postgresql://jobs:jobs@127.0.0.1:5432/jobs";
    poolEnd.mockRejectedValueOnce(new Error("pool close failure"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, shutdown } = startServer();

    if (!server.listening) {
      await new Promise<void>((resolve) => server.once("listening", resolve));
    }

    const closed = new Promise<void>((resolve) => server.once("close", resolve));
    try {
      shutdown();
      await closed;
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(consoleError).toHaveBeenCalledWith("Failed to close database connection pool");
      expect(process.exitCode).toBe(1);
    } finally {
      consoleError.mockRestore();
      if (server.listening) {
        shutdown();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });
});
