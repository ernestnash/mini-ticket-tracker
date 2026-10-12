import { z } from 'zod';

// status is not accepted on create: every ticket starts as "open".
export const createTicketSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullish(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  })
  .strict();

export const listTicketsQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1), // cap keeps OFFSET far below bigint overflow
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
