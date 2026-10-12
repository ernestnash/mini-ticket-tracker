import { z } from 'zod';

// status is not accepted on create: every ticket starts as "open".
export const createTicketSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullish(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  })
  .strict();
