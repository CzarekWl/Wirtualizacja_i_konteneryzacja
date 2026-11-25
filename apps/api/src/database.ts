import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", () => {
  console.error("Unexpected error on an idle PostgreSQL client");
});
