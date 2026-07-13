CREATE TABLE pades_remote_sessions (
  id uuid PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES pades_private_tickets(id) ON DELETE RESTRICT,
  provider_session_id uuid NOT NULL UNIQUE,
  provider_kind text NOT NULL CHECK (provider_kind = 'rest_pki_core'),
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled', 'expired', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pades_remote_sessions_status_idx ON pades_remote_sessions (status, updated_at);
CREATE UNIQUE INDEX pades_remote_sessions_one_pending_idx ON pades_remote_sessions (ticket_id) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION prevent_remote_session_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.ticket_id <> OLD.ticket_id
     OR NEW.provider_session_id <> OLD.provider_session_id
     OR NEW.provider_kind <> OLD.provider_kind
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'remote PAdES session identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pades_remote_session_identity_immutable
  BEFORE UPDATE ON pades_remote_sessions
  FOR EACH ROW EXECUTE FUNCTION prevent_remote_session_identity_change();
