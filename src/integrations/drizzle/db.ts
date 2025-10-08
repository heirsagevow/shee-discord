import { cfg } from "@/utils/config";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { Pool } from "pg";

const POOL_CONFIG = {
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500,
} as const;

const createDatabasePool = (): Pool =>
  new Pool({
    connectionString: cfg.DATABASE_URL,
    ssl: false,
    ...POOL_CONFIG,
  });

const handlePoolError = (err: Error) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
};

export const pool = createDatabasePool();
pool.on("error", handlePoolError);

export const db = drizzle(pool, {
  casing: "snake_case",
});

export type Executor = typeof db | PgTransaction<any, any, any>;

export const testConnection = async (): Promise<boolean> => {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connection successful");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    return false;
  }
};

export const closeDatabase = async (): Promise<void> => {
  try {
    await pool.end();
    console.log("✅ Database connection closed");
  } catch (error) {
    console.error("❌ Error closing database:", error);
  }
};
