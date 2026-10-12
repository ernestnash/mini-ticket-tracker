import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.ts';
import { pool } from './db.ts';

type Ticket = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
};

let server: Server;
let baseUrl: string;
const createdIds: string[] = [];

before(async () => {
  server = createApp().listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

// Tests only delete the rows they created, so they are safe to run against a shared hosted database.
after(async () => {
  if (createdIds.length > 0) {
    await pool.query('DELETE FROM tickets WHERE id = ANY($1::uuid[])', [createdIds]);
  }
  server.close();
  await pool.end();
});

type Page = { data: Ticket[]; page: number; limit: number; total: number };

function get(path: string) {
  return fetch(`${baseUrl}${path}`);
}

async function createTicket(title: string) {
  const res = await post(JSON.stringify({ title }));
  const ticket = (await res.json()) as Ticket;
  createdIds.push(ticket.id);
  return ticket;
}

function post(body: string) {
  return fetch(`${baseUrl}/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

test('POST /tickets creates a ticket with defaults', async () => {
  const res = await post(JSON.stringify({ title: 'Printer is on fire' }));
  assert.equal(res.status, 201);

  const ticket = (await res.json()) as Ticket;
  createdIds.push(ticket.id);
  assert.match(ticket.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(ticket.title, 'Printer is on fire');
  assert.equal(ticket.description, null);
  assert.equal(ticket.status, 'open');
  assert.equal(ticket.priority, 'medium');
  assert.ok(!Number.isNaN(Date.parse(ticket.createdAt)));

  const { rows } = await pool.query('SELECT title, status FROM tickets WHERE id = $1', [ticket.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Printer is on fire');
});

test('POST /tickets stores description and priority and trims the title', async () => {
  const res = await post(
    JSON.stringify({ title: '  Login fails  ', description: 'Gets a 500 on submit', priority: 'high' }),
  );
  assert.equal(res.status, 201);

  const ticket = (await res.json()) as Ticket;
  createdIds.push(ticket.id);
  assert.equal(ticket.title, 'Login fails');
  assert.equal(ticket.description, 'Gets a 500 on submit');
  assert.equal(ticket.priority, 'high');
  assert.equal(ticket.status, 'open');
});

test('POST /tickets rejects a missing, blank or non-string title', async () => {
  for (const body of [{}, { title: '   ' }, { title: 123 }]) {
    const res = await post(JSON.stringify(body));
    assert.equal(res.status, 400, JSON.stringify(body));
    const json = (await res.json()) as { error: string; details: unknown[] };
    assert.equal(json.error, 'Validation failed');
    assert.ok(json.details.length > 0);
  }
});

test('POST /tickets rejects an invalid priority and a client-supplied status', async () => {
  for (const body of [
    { title: 'x', priority: 'urgent' },
    { title: 'x', status: 'closed' },
  ]) {
    const res = await post(JSON.stringify(body));
    assert.equal(res.status, 400, JSON.stringify(body));
  }
});

test('POST /tickets rejects malformed JSON', async () => {
  const res = await post('{"title":');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid JSON body' });
});

// The list tests run against a shared database, so they only assert on rows they created
// (which are the newest) plus totals compared with a direct count.
test('GET /tickets lists newest first and paginates', async () => {
  const a = await createTicket('list-test A');
  const b = await createTicket('list-test B');
  const c = await createTicket('list-test C');

  const ids: string[] = [];
  for (const page of [1, 2, 3]) {
    const res = await get(`/tickets?limit=1&page=${page}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Page;
    assert.equal(body.page, page);
    assert.equal(body.limit, 1);
    assert.equal(body.data.length, 1);
    ids.push(body.data[0]!.id);
  }
  assert.deepEqual(ids, [c.id, b.id, a.id]);
});

test('GET /tickets applies default paging and returns the total', async () => {
  await createTicket('list-test defaults');

  const res = await get('/tickets');
  assert.equal(res.status, 200);
  const body = (await res.json()) as Page;
  assert.equal(body.page, 1);
  assert.equal(body.limit, 20);
  assert.ok(body.data.length >= 1 && body.data.length <= 20);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM tickets');
  assert.equal(body.total, rows[0].n);
});

test('GET /tickets filters by status', async () => {
  const open = await createTicket('list-test open');
  const inserted = await pool.query(
    "INSERT INTO tickets (title, status) VALUES ('list-test closed', 'closed') RETURNING id",
  );
  const closedId = inserted.rows[0].id as string;
  createdIds.push(closedId);

  const closed = (await (await get('/tickets?status=closed&limit=100')).json()) as Page;
  assert.ok(closed.data.every((t) => t.status === 'closed'));
  assert.ok(closed.data.some((t) => t.id === closedId));
  const closedCount = await pool.query("SELECT count(*)::int AS n FROM tickets WHERE status = 'closed'");
  assert.equal(closed.total, closedCount.rows[0].n);

  const opened = (await (await get('/tickets?status=open&limit=100')).json()) as Page;
  assert.ok(opened.data.every((t) => t.status === 'open'));
  assert.ok(opened.data.some((t) => t.id === open.id));
  assert.ok(!opened.data.some((t) => t.id === closedId));
});

test('GET /tickets returns an empty page beyond the last page', async () => {
  const res = await get('/tickets?page=1000000');
  assert.equal(res.status, 200);
  const body = (await res.json()) as Page;
  assert.deepEqual(body.data, []);
  assert.equal(typeof body.total, 'number');
});

test('GET /tickets rejects invalid query params', async () => {
  for (const query of [
    'status=bogus',
    'status=open&status=closed',
    'page=0',
    'page=abc',
    'page=1000001',
    'limit=0',
    'limit=101',
  ]) {
    const res = await get(`/tickets?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(((await res.json()) as { error: string }).error, 'Validation failed', query);
  }
});
