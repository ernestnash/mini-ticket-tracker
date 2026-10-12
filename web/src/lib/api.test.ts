import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createTicket, errorMessage, getStats, listTickets, totalPages, updateTicket } from './api.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

test('listTickets sends paging and only includes status when filtering', async () => {
  const calls = mockFetch(200, { data: [], page: 2, limit: 10, total: 0 });

  await listTickets({ page: 2, limit: 10 });
  await listTickets({ status: 'in_progress', page: 1, limit: 5 });

  assert.equal(calls[0]!.url, '/api/tickets?page=2&limit=10');
  assert.equal(calls[1]!.url, '/api/tickets?page=1&limit=5&status=in_progress');
});

test('createTicket POSTs the ticket as JSON and returns the created ticket', async () => {
  const created = { id: 'abc', title: 'Printer', status: 'open', priority: 'high' };
  const calls = mockFetch(201, created);

  const result = await createTicket({ title: 'Printer', priority: 'high' });

  assert.deepEqual(result, created);
  assert.equal(calls[0]!.url, '/api/tickets');
  assert.equal(calls[0]!.init?.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), { title: 'Printer', priority: 'high' });
});

test('updateTicket PATCHes only the changed fields', async () => {
  const calls = mockFetch(200, { id: 'abc', status: 'closed' });

  await updateTicket('abc', { status: 'closed' });

  assert.equal(calls[0]!.url, '/api/tickets/abc');
  assert.equal(calls[0]!.init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0]!.init?.body as string), { status: 'closed' });
});

test('getStats reads the counts per status', async () => {
  const calls = mockFetch(200, { open: 1, in_progress: 0, closed: 2 });
  assert.deepEqual(await getStats(), { open: 1, in_progress: 0, closed: 2 });
  assert.equal(calls[0]!.url, '/api/tickets/stats');
});

test('API validation errors become an ApiError with readable field messages', async () => {
  mockFetch(400, { error: 'Validation failed', details: [{ path: 'title', message: 'Too small' }] });

  await assert.rejects(
    createTicket({ title: '', priority: 'low' }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      assert.equal(errorMessage(err), 'Validation failed: Too small');
      return true;
    },
  );
});

test('a non-JSON error from the proxy is reported as the API being unavailable', async () => {
  mockFetch(502, 'Bad Gateway');
  await assert.rejects(getStats(), (err: unknown) => err instanceof ApiError && err.message === 'The API is unavailable');
});

test('totalPages never drops below one page', () => {
  assert.equal(totalPages(0, 10), 1);
  assert.equal(totalPages(10, 10), 1);
  assert.equal(totalPages(11, 10), 2);
  assert.equal(totalPages(25, 10), 3);
});
