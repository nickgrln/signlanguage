import { Pool, type PoolClient } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

export async function withConnection<T>(work: (connection: PoolClient) => Promise<T>): Promise<T> {
  const connection = await pool.connect();
  try {
    return await work(connection);
  } finally {
    connection.release();
  }
}
