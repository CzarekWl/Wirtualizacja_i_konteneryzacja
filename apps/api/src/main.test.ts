// this tests the "isMainModule" startup branch in index.ts.
// Importing index.ts skips it, so we fake argv and re-import to cover server startup.
import { fileURLToPath } from "node:url";
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
});
