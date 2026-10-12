# Mini Ticket Tracker

Take-home for Lodwar Services (Mid-Level Full-Stack Developer): a minimal REST API,
PostgreSQL database and single-page UI for tracking support tickets.

**Stack:** Node.js · Express 5 · TypeScript · PostgreSQL · Next.js

## Roadmap

I split the work into sprints. Each feature lives on its own branch, is merged into `master`
with a merge commit, and CI must pass on `master`.

| Sprint | Branch(es) | Delivers | Status |
| --- | --- | --- | --- |
| 0 | `master` | Repo, API skeleton with `/health`, test runner, CI | done |
| 1 | `feat/create-ticket` | Postgres via docker compose, schema, `POST /tickets`, validation, tests | done |
| 2 | `feat/list-tickets` | `GET /tickets` with `?status=` filter and `?page=&limit=` pagination | done |
| 3 | `feat/update-ticket`, `feat/ticket-stats` | `PATCH /tickets/:id`, `GET /tickets/stats` | done |
| 4 | `feat/web-ui` | Next.js page: ticket list, create form, status change | done |
| 5 | `docs/final-readme` | Decisions & Tradeoffs, Azure deployment notes, final pass | planned |

## Running the API

Requires Node.js 22.18 or newer (see `api/package.json` engines).

```bash
cd api
npm install
cp .env.example .env   # then set DATABASE_URL to your hosted PostgreSQL connection string
npm run db:migrate     # creates the tickets table (idempotent)
npm run dev            # http://localhost:3001/health
npm test               # runs db:migrate, then the integration tests (node:test)
npm run typecheck      # tsc --noEmit
```

No local PostgreSQL is needed: the API reads `DATABASE_URL` from `api/.env` (loaded with Node's
built-in `--env-file`). Hosted providers usually require SSL, so keep `?sslmode=require` in the URL.
Tests only delete the rows they create, so they are safe to run against a shared database.

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

`total` is the number of tickets matching the filter (not just this page). A page past the
end returns `200` with an empty `data` array. Invalid params respond `400`. Pagination uses
`OFFSET`, which matches the spec but slows down on very deep pages; keyset pagination would
be the next step at scale.

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
when no ticket has that id. Any status transition is allowed (including reopening a closed
ticket); a state machine would be the next step if the workflow needs rules.

### `GET /tickets/stats`

Returns the number of tickets per status. Every status is always present, with `0` when there
are no tickets in it, so clients never have to handle a missing key.

```bash
curl http://localhost:3001/tickets/stats
```

```json
{ "open": 12, "in_progress": 3, "closed": 27 }
```

It is a single `GROUP BY status` query. That is a full scan of the table (about 30k rows is
still a trivial `HashAggregate`), so its cost grows with table size; for very large tables a
cached or incrementally maintained counter would be the next step.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck and tests on every push to
`master` and on every pull request targeting `master`. The `api` job starts a throwaway
PostgreSQL service container and points `DATABASE_URL` at it, so CI never touches your hosted
database. The `web` job runs the client tests, builds the app and type-checks it. It uses `npm ci`, so commit
`api/package-lock.json` and `web/package-lock.json` (generated by the first `npm install`).

## Decisions & Tradeoffs

- **Two pages, not one.** The brief allows a single page, but submitting and triaging are different jobs, so `/new` and `/` keep each one uncluttered; the cost is one extra route and a redirect.
- **Plain SQL with `pg` and zod, no ORM.** Four queries do not justify a query builder or migration framework; constraints (`CHECK` on status and priority, non-blank title) live in the database so they hold for any client. The schema script is idempotent instead of a versioned migration tool.
- **`OFFSET` pagination.** It matches the requested `?page=&limit=` and is simple; `created_at DESC, id DESC` ordering keeps pages stable, and the page number is capped. Keyset pagination is the fix if deep pages get slow.
- **Any status transition is allowed**, including reopening a closed ticket, because the brief defines no workflow. A state machine is the next step if rules appear.
- **The browser talks only to `/api/*` on the Next.js origin**, rewritten to Express, so there is no CORS configuration and the API URL stays server-side.
- **Tests are integration tests against a real Postgres** (`node:test`, built-in `fetch`), not mocks. They delete only the rows they create, so they are safe on a shared database, and CI uses a throwaway Postgres service container.
- **Shortcuts taken:** no authentication or users, no editing of title or description, no delete, no component or end-to-end tests, no rate limiting or request logging.
- **With more time:** Playwright tests of both pages, auth with per-user tickets, keyset pagination, and structured logging with a readiness check that pings the database.

## Deploying to Azure

Not deployed as part of this exercise; this is the intended shape.

- **Database:** Azure Database for PostgreSQL (Flexible Server). Set `DATABASE_URL` with `sslmode=require` and run `npm run db:migrate` once per release as a pipeline step.
- **API:** a container on Azure Container Apps (or App Service) listening on `PORT`, with `DATABASE_URL` held as a secret, not baked into the image.
- **Web:** a second container (or App Service) running `next start`, with `API_URL` pointing at the API's internal address. Because the rewrite runs on the server, the API need not be public.
- **Pipeline:** the existing GitHub Actions workflow already gates `master`; add a deploy job that builds the two images and rolls them out after CI passes.
