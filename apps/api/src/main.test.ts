// this tests the "isMainModule" startup branch in index.ts.
// Importing index.ts skips it, so we fake argv and re-import to cover server startup.
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import { afterAll, describe, expect, it, vi } from "vitest";

const originalArgv = process.argv;
const originalPort = process.env.PORT;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterAll(() => {
  process.argv = originalArgv;
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
});

describe("API entry point", () => {
  it("starts the server when executed as the main module", async () => {
    process.env.PORT = "0";
    process.env.DATABASE_URL = "postgresql://jobs:jobs@127.0.0.1:5432/jobs";
    process.argv = [
      process.argv[0] ?? "node",
      fileURLToPath(new URL("./index.ts", import.meta.url)),
    ];
    vi.resetModules();

    const { server } = await import("./index.js");

    expect(server).toBeDefined();
    if (!server) {
      throw new Error("Expected the server to be started");
    }

    if (!server.listening) {
      await new Promise<void>((resolve) => server.once("listening", resolve));
    }

    // Let the listen callback run before shutting the server down.
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(server.listening).toBe(true);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    const { pool } = await import("./database.js");
    await pool.end();
  });

  it("closes the server and database pool once on SIGTERM", async () => {
    process.env.PORT = "0";
    process.env.DATABASE_URL = "postgresql://jobs:jobs@127.0.0.1:5432/jobs";
    process.argv = [
      process.argv[0] ?? "node",
      fileURLToPath(new URL("./index.ts", import.meta.url)),
    ];
    vi.resetModules();

    const previousSigtermListeners = process.listeners("SIGTERM");
    const previousRawSigintListeners = process.rawListeners("SIGINT");
    const previousRawSigtermListeners = process.rawListeners("SIGTERM");
    const originalExitCode = process.exitCode;
    const { pool } = await import("./database.js");
    const endPool = vi.spyOn(pool, "end");
    let server: Server | undefined;

    try {
      const entry = await import("./index.js");
      server = entry.server;

      expect(server).toBeDefined();
      if (!server) {
        throw new Error("Expected the server to be started");
      }

      if (!server.listening) {
        await new Promise<void>((resolve) => server?.once("listening", resolve));
      }

      const shutdown = process
        .listeners("SIGTERM")
        .find((listener) => !previousSigtermListeners.includes(listener));
      expect(shutdown).toBeTypeOf("function");
      if (!shutdown) {
        throw new Error("Expected a SIGTERM shutdown handler to be registered");
      }

      const closed = new Promise<void>((resolve) => server?.once("close", resolve));
      Reflect.apply(shutdown, process, []);
      Reflect.apply(shutdown, process, []);
      await closed;

      expect(endPool).toHaveBeenCalledTimes(1);
      await endPool.mock.results[0]?.value;
    } finally {
      for (const listener of process.rawListeners("SIGINT")) {
        if (!previousRawSigintListeners.includes(listener)) {
          Reflect.apply(listener, process, []);
        }
      }
      for (const listener of process.rawListeners("SIGTERM")) {
        if (!previousRawSigtermListeners.includes(listener)) {
          Reflect.apply(listener, process, []);
        }
      }

      if (server?.listening) {
        await new Promise<void>((resolve) => {
          server?.close(() => resolve());
        });
      }
      if (endPool.mock.calls.length === 0) {
        await pool.end();
      } else {
        await endPool.mock.results[0]?.value;
      }
      process.exitCode = originalExitCode;
    }
  });
});
