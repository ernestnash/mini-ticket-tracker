import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy api/.env.example to api/.env and fill it in.');
}

export const pool = new pg.Pool({ connectionString });

// Hosted databases drop idle connections; without this listener that would crash the process.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});
