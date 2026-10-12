import { Router } from 'express';
import type { Response } from 'express';
import type { ZodError } from 'zod';
import { pool } from './db.ts';
import { createTicketSchema, listTicketsQuerySchema, ticketIdSchema, updateTicketSchema } from './schemas.ts';

export const ticketsRouter = Router();

const COLUMNS = `id, title, description, status, priority, created_at AS "createdAt"`;

function sendValidationError(res: Response, error: ZodError) {
  res.status(400).json({
    error: 'Validation failed',
    details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

ticketsRouter.post('/', async (req, res) => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { title, description, priority } = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO tickets (title, description, priority)
     VALUES ($1, $2, $3)
     RETURNING ${COLUMNS}`,
    [title, description ?? null, priority],
  );
  res.status(201).json(rows[0]);
});

ticketsRouter.get('/', async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const { status, page, limit } = parsed.data;
  // Only fixed SQL fragments are concatenated; every value goes through a bind parameter.
  const where = status ? 'WHERE status = $1' : '';
  const filterParams = status ? [status] : [];
  const n = filterParams.length;

  // OFFSET pagination matches the ?page=&limit= spec; switch to keyset (cursor) for very deep pages.
  const [list, count] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNS} FROM tickets ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...filterParams, limit, (page - 1) * limit],
    ),
    pool.query(`SELECT count(*)::int AS total FROM tickets ${where}`, filterParams),
  ]);

  res.json({ data: list.rows, page, limit, total: count.rows[0].total });
});

ticketsRouter.patch('/:id', async (req, res) => {
  const id = ticketIdSchema.safeParse(req.params.id);
  if (!id.success) {
    sendValidationError(res, id.error);
    return;
  }
  const body = updateTicketSchema.safeParse(req.body);
  if (!body.success) {
    sendValidationError(res, body.error);
    return;
  }

  // COALESCE keeps the current value for any field the client did not send.
  // any status transition is allowed (including reopening closed tickets); add a state machine if the workflow needs one.
  const { status, priority } = body.data;
  const { rows } = await pool.query(
    `UPDATE tickets
     SET status = COALESCE($2, status), priority = COALESCE($3, priority)
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id.data, status ?? null, priority ?? null],
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  res.json(rows[0]);
});
