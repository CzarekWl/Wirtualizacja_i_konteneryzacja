import { afterEach, describe, expect, it, vi } from "vitest";

const { Pool, poolOn } = vi.hoisted(() => {
  const poolOn = vi.fn<(event: string, listener: (error: Error) => void) => void>();

  class MockPool {
    private readonly listeners = new Map<string, ((error: Error) => void)[]>();

    on(event: string, listener: (error: Error) => void): this {
      const eventListeners = this.listeners.get(event) ?? [];
      eventListeners.push(listener);
      this.listeners.set(event, eventListeners);
      poolOn(event, listener);
      return this;
    }

    emit(event: string, error: Error): boolean {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(error);
      }

      return true;
    }

    listenerCount(event: string): number {
      return this.listeners.get(event)?.length ?? 0;
    }
  }

  return { Pool: vi.fn(MockPool), poolOn };
});

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
  it("does not read DATABASE_URL or create a pool when imported", async () => {
    delete process.env.DATABASE_URL;

    await Promise.all([import("./database.js"), import("./app.js")]);
    expect(Pool).not.toHaveBeenCalled();
  });

  it("creates one pool using the supplied connection string", async () => {
    const connectionString = "postgresql://jobs:jobs@localhost:5432/jobs";
    const { createPool } = await import("./database.js");
    const pool = createPool(connectionString);

    expect(Pool).toHaveBeenCalledTimes(1);
    expect(Pool).toHaveBeenCalledWith({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });
    expect(pool).toBeInstanceOf(Pool);
  });

  it("logs errors emitted by an idle database client", async () => {
    const { createPool } = await import("./database.js");
    const pool = createPool("postgresql://jobs:jobs@localhost:5432/jobs");
    expect(poolOn).toHaveBeenCalledTimes(1);
    expect(poolOn).toHaveBeenCalledWith("error", expect.any(Function));
    expect(pool.listenerCount("error")).toBe(1);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = new Error("connection lost");
      pool.emit("error", error);

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected error on an idle PostgreSQL client",
        error,
      );
      expect(consoleError.mock.calls[0]?.[1]).toBe(error);
    } finally {
      consoleError.mockRestore();
    }
  });
});
