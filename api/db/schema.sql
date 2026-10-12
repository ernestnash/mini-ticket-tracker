-- Idempotent: safe to run on every deploy and before every test run.
CREATE TABLE IF NOT EXISTS tickets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL CHECK (length(btrim(title)) > 0),
  description text,
  status      text        NOT NULL DEFAULT 'open'   CHECK (status   IN ('open', 'in_progress', 'closed')),
  priority    text        NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Serve GET /tickets: newest-first listing, with and without a status filter.
CREATE INDEX IF NOT EXISTS tickets_created_at_idx        ON tickets (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS tickets_status_created_at_idx ON tickets (status, created_at DESC, id DESC);
