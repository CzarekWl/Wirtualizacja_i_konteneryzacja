import { afterEach, describe, expect, it, vi } from "vitest";

const { Pool, poolOn } = vi.hoisted(() => ({
  poolOn: vi.fn<(event: string, listener: (error: Error) => void) => void>(),
  Pool: vi.fn(
    class MockPool {
      on = poolOn;
    },
  ),
}));

vi.mock("pg", () => ({ Pool }));

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  vi.resetModules();
  vi.clearAllMocks();
});

describe("database connection pool", () => {
  it("fails clearly when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("./database.js")).rejects.toThrow(
      "DATABASE_URL environment variable is required",
    );
    expect(Pool).not.toHaveBeenCalled();
  });

  it("creates one pool using DATABASE_URL", async () => {
    const connectionString = "postgresql://jobs:jobs@localhost:5432/jobs";
    process.env.DATABASE_URL = connectionString;

    await import("./database.js");

    expect(Pool).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledWith({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });
  });

  it("logs errors emitted by an idle database client", async () => {
    process.env.DATABASE_URL = "postgresql://jobs:jobs@localhost:5432/jobs";
    await import("./database.js");

    const errorHandler = poolOn.mock.calls.find(([event]) => event === "error")?.[1];
    expect(errorHandler).toBeTypeOf("function");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      if (typeof errorHandler !== "function") {
        throw new Error("Expected the pool to register an error handler");
      }

      const error = new Error("connection lost");
      errorHandler(error);

      expect(consoleError).toHaveBeenCalledWith("Unexpected error on an idle PostgreSQL client");
    } finally {
      consoleError.mockRestore();
    }
  });
});
