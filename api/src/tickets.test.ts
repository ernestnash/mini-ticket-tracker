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
