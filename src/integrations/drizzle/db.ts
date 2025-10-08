import { cfg } from '@/lib/config';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

const pool = new Pool({
	connectionString: cfg.DATABASE_URL,
	ssl: false,
	max: 20, // Maximum number of clients in the pool
	idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
	connectionTimeoutMillis: 2000, // How long to wait for a connection
	maxUses: 7500, // Close a connection after it has been used this many times
});

// Handle pool errors
pool.on('error', (err) => {
	console.error('Unexpected error on idle client', err);
	process.exit(-1);
});

export const db = drizzle(pool, {
	casing: 'snake_case',
});

export type Executor = typeof db | PgTransaction<any, any, any>;

// Export pool for connection management
export { pool };
