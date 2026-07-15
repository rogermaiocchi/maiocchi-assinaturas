CREATE TABLE artifact_deletion_queue (
  id bigserial PRIMARY KEY,
  storage_key text NOT NULL
    CHECK (storage_key ~ '^sha256/[a-f0-9]{2}/[a-f0-9]{64}\.[a-z0-9]{1,8}$'),
  source_ticket_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason = 'expired-private-ticket'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'deleted', 'retained')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pending' AND resolved_at IS NULL)
      OR (status <> 'pending' AND resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX artifact_deletion_queue_pending_key_idx
  ON artifact_deletion_queue (storage_key) WHERE status = 'pending';

CREATE INDEX artifact_deletion_queue_pending_created_idx
  ON artifact_deletion_queue (created_at, id) WHERE status = 'pending';
