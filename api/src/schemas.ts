import { z } from 'zod';

export const STATUSES = ['open', 'in_progress', 'closed'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

// status is not accepted on create: every ticket starts as "open".
export const createTicketSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullish(),
    priority: z.enum(PRIORITIES).default('medium'),
  })
  .strict();

export const listTicketsQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1), // cap keeps OFFSET far below bigint overflow
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Validated up front so a malformed id is a 400, not a Postgres "invalid uuid" 500.
export const ticketIdSchema = z.string().uuid();

// Only status and priority are editable; at least one is required and anything else is rejected.
export const updateTicketSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .strict()
  .refine((v) => v.status !== undefined || v.priority !== undefined, {
    message: 'Provide status and/or priority',
  });
