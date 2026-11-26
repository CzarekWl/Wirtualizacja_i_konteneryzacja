import { Pool } from "pg";

export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (error) => {
    console.error("Unexpected error on an idle PostgreSQL client", error);
  });

  return pool;
}
