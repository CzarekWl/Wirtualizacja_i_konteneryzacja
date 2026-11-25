import { afterEach, describe, expect, it, vi } from "vitest";

const { Pool } = vi.hoisted(() => ({
  Pool: vi.fn(
    class MockPool {
      on = vi.fn();
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
});
