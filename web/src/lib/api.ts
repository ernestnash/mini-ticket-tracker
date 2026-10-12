export const STATUSES = ['open', 'in_progress', 'closed'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export type Ticket = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  createdAt: string;
};
export type TicketPage = { data: Ticket[]; page: number; limit: number; total: number };
export type Stats = Record<Status, number>;

type FieldError = { path: string; message: string };

export class ApiError extends Error {
  status: number;
  details: FieldError[];

  constructor(message: string, status: number, details: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  // A proxy error page or an empty body is not JSON, so parsing is allowed to fail.
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const fallback = res.status >= 500 ? 'The API is unavailable' : `Request failed (${res.status})`;
    throw new ApiError(body?.error ?? fallback, res.status, body?.details);
  }
  return body as T;
}

export function listTickets(params: { status?: Status; page: number; limit: number }) {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.status) query.set('status', params.status);
  return request<TicketPage>(`/tickets?${query}`);
}

export function getStats() {
  return request<Stats>('/tickets/stats');
}

export function createTicket(input: { title: string; description?: string; priority: Priority }) {
  return request<Ticket>('/tickets', { method: 'POST', body: JSON.stringify(input) });
}

export function updateTicket(id: string, changes: { status?: Status; priority?: Priority }) {
  return request<Ticket>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
}

export function totalPages(total: number, limit: number) {
  return Math.max(1, Math.ceil(total / limit));
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError && err.details.length > 0) {
    return `${err.message}: ${err.details.map((d) => d.message).join(', ')}`;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
