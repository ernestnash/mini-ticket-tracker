# Mini Ticket Tracker

Take-home for Lodwar Services (Mid-Level Full-Stack Developer): a REST API, a PostgreSQL
database and a small UI for tracking support tickets.

**Stack:** Node.js · Express 5 · TypeScript · PostgreSQL · Next.js 16 (React 19)

**Layout:** `api/` is the REST API and database schema, `web/` is the Next.js UI.

## Quick start (Docker)

Requires Docker with Compose. No database account or configuration is needed: Compose starts its own PostgreSQL.

```bash
git clone https://github.com/ernestnash/mini-ticket-tracker.git
cd mini-ticket-tracker
docker compose up --build
```

- UI: <http://localhost:3000> (`/` lists and updates tickets, `/new` creates one)
- API: <http://localhost:3001> (try `/health`)

The API creates the schema on start. Data lives in a Docker volume; `docker compose down -v` resets it.
Ports 3000 and 3001 must be free. The first build downloads fonts, so it needs network access.

## Running without Docker

Requires Node.js 22.18 or newer and a PostgreSQL database. If you have none, start one with:

```bash
docker run --name tickets-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:18
```

**API**

```bash
cd api
npm install
cp .env.example .env   # set DATABASE_URL, e.g. postgres://postgres:postgres@localhost:5432/postgres
npm run db:migrate     # creates the tickets table (idempotent)
npm run dev            # http://localhost:3001/health
```

**Web UI** (needs the API running)

```bash
cd web
npm install
cp .env.example .env   # optional: only if the API is not on http://localhost:3001
npm run dev            # http://localhost:3000
```

For a hosted database, keep `?sslmode=require` in `DATABASE_URL`.

## Tests

```bash
cd api && npm test     # runs db:migrate, then the integration tests against DATABASE_URL
cd web && npm test     # unit tests for the API client
```

The API tests are integration tests: they call the real HTTP endpoints against a real PostgreSQL and
delete only the rows they create, so they are safe on a shared database. They cover create, list
with filter and pagination, update, and stats. `npm run typecheck` runs `tsc --noEmit` in each package.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request to `master`:

- `api`: typecheck and integration tests against a throwaway PostgreSQL service container.
- `web`: client tests, production build and typecheck.
- `docker`: builds the compose stack, starts it, creates a ticket through the UI's `/api` proxy and checks the stats.

## API

Errors are JSON: `{ "error": "..." }`, with a `details` array for validation failures.
Field names are camelCase in responses.

### `POST /tickets`

Creates a ticket. `status` always starts as `open` and cannot be supplied.

| Field | Type | Rules |
| --- | --- | --- |
| `title` | string | required, trimmed, 1-200 chars |
| `description` | string | optional, up to 5000 chars |
| `priority` | `low` \| `medium` \| `high` | optional, defaults to `medium` |

```bash
curl -i -X POST http://localhost:3001/tickets \
  -H "content-type: application/json" \
  -d '{"title":"Printer is on fire","priority":"high"}'
```

Responds `201` with the created ticket:

```json
{
  "id": "5b0f6f0e-0d6e-4a1c-9f55-3a2f1f4f8c11",
  "title": "Printer is on fire",
  "description": null,
  "status": "open",
  "priority": "high",
  "createdAt": "2026-10-11T07:12:34.567Z"
}
```

Invalid input responds `400`.

### `GET /tickets`

Lists tickets, newest first (`createdAt` descending, `id` as a tie-breaker so pages never
skip or repeat rows).

| Query param | Rules |
| --- | --- |
| `status` | optional: `open`, `in_progress` or `closed` |
| `page` | optional integer, 1 to 1,000,000, defaults to `1` |
| `limit` | optional integer, 1 to 100, defaults to `20` |

```bash
curl "http://localhost:3001/tickets?status=open&page=1&limit=10"
```

```json
{
  "data": [
    {
      "id": "5b0f6f0e-0d6e-4a1c-9f55-3a2f1f4f8c11",
      "title": "Printer is on fire",
      "description": null,
      "status": "open",
      "priority": "high",
      "createdAt": "2026-10-11T07:12:34.567Z"
    }
  ],
  "page": 1,
  "limit": 10,
  "total": 42
}
```

`total` is the number of tickets matching the filter, not just this page. A page past the end
returns `200` with an empty `data` array. Invalid params respond `400`.

### `PATCH /tickets/:id`

Partially updates a ticket. Only `status` and `priority` can change, at least one is required,
and any other field (for example `title`) is rejected with `400`.

| Field | Type |
| --- | --- |
| `status` | `open` \| `in_progress` \| `closed` |
| `priority` | `low` \| `medium` \| `high` |

```bash
curl -X PATCH http://localhost:3001/tickets/5b0f6f0e-0d6e-4a1c-9f55-3a2f1f4f8c11 \
  -H "content-type: application/json" \
  -d '{"status":"in_progress"}'
```

Responds `200` with the updated ticket, `400` for a malformed id or invalid body, and `404`
when no ticket has that id.

### `GET /tickets/stats`

Returns the number of tickets per status. Every status is always present, with `0` when there
are none, so clients never handle a missing key.

```bash
curl http://localhost:3001/tickets/stats
```

```json
{ "open": 12, "in_progress": 3, "closed": 27 }
```

## UI

- `/` lists tickets with status and priority, has status tabs with live counts, a status dropdown on every row, and pagination (10 per page).
- `/new` is the create form: title and description with character counters, priority choice, and API validation errors shown next to the field. A successful create returns to `/` with a confirmation.

The browser only talks to `/api/*` on the Next.js origin. `next.config.ts` rewrites that to the
Express API (`API_URL`), so the API needs no CORS configuration.

## Assumptions

- A new ticket always starts as `open`; the client cannot set the status on create.
- Priority is optional on create and defaults to `medium`.
- Only `status` and `priority` can be changed after creation; title and description are fixed.
- Any status can change to any other, including reopening a closed ticket, because the brief defines no workflow.
- Tickets are listed newest first, with a default page size of 20 and a maximum of 100.
- Ids are UUIDs and timestamps are stored in UTC.
- There are no users or authentication, so every ticket is visible to everyone.

## Decisions & Tradeoffs

I used plain SQL with `pg` and zod instead of an ORM, because four queries do not justify a query builder, and the `CHECK` constraints on status, priority and title live in the database so they hold for any client. The schema is one idempotent SQL file run on start rather than a versioned migration tool, which I would replace as soon as a second schema change appears. Listing uses `OFFSET` pagination to match the requested `?page=&limit=`, with a stable `created_at DESC, id DESC` order; keyset pagination would be the fix if deep pages got slow. The stats endpoint is a single `GROUP BY` that scans the table, which is fine at this size, but I would cache or maintain counters for a very large table. The UI is two pages instead of the single page the brief allows, because creating and triaging tickets are different jobs and each stays uncluttered. The browser talks to the API through a Next.js rewrite, so there is no CORS setup and the API address stays server-side. Tests are integration tests against a real PostgreSQL rather than mocks, and CI runs them against a throwaway database. Shortcuts: no authentication, no editing of title or description, no delete, no component or end-to-end tests, and no rate limiting or request logging. With more time I would add Playwright tests for both pages, per-user tickets with auth, and a readiness check that pings the database.

## Roadmap (commit history)

I built this in sprints, one feature branch each, merged into `master` with a merge commit.

| Sprint | Branch(es) | Delivers |
| --- | --- | --- |
| 0 | `master` | Repo, API skeleton with `/health`, test runner, CI |
| 1 | `feat/create-ticket` | Schema, `POST /tickets`, validation, tests |
| 2 | `feat/list-tickets` | `GET /tickets` with `?status=` filter and pagination |
| 3 | `feat/update-ticket`, `feat/ticket-stats` | `PATCH /tickets/:id`, `GET /tickets/stats` |
| 4 | `feat/web-ui` | Next.js UI: ticket list, create form, status change |
| 5 | `feat/docker` | Docker Compose setup, CI smoke test, final README |