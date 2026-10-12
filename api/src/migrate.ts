import { readFile } from 'node:fs/promises';
import { pool } from './db.ts';

// Tradeoff: one idempotent schema file; swap for a migration tool once there is a second change to track.
const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');

try {
  await pool.query(sql);
  console.log('Database schema is up to date');
} finally {
  await pool.end();
}
