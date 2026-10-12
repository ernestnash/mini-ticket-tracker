import { Router } from 'express';
import { pool } from './db.ts';
import { createTicketSchema } from './schemas.ts';

export const ticketsRouter = Router();

ticketsRouter.post('/', async (req, res) => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  const { title, description, priority } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO tickets (title, description, priority)
     VALUES ($1, $2, $3)
     RETURNING id, title, description, status, priority, created_at AS "createdAt"`,
    [title, description ?? null, priority],
  );
  res.status(201).json(rows[0]);
});
