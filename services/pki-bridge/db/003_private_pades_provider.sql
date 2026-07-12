CREATE TABLE pades_private_tickets (
  id uuid PRIMARY KEY,
  token_sha256 bytea NOT NULL UNIQUE CHECK (octet_length(token_sha256) = 32),
  document_name text NOT NULL CHECK (char_length(document_name) BETWEEN 1 AND 120),
  source_pdf_sha256 bytea NOT NULL CHECK (octet_length(source_pdf_sha256) = 32),
  source_pdf_storage_key text NOT NULL,
  source_pdf_size bigint NOT NULL CHECK (source_pdf_size > 0),
  status text NOT NULL CHECK (status IN ('pending', 'prepared', 'completed', 'failed', 'cancelled')),
  provider_session_id uuid,
  certificate_fingerprint_sha256 bytea CHECK (certificate_fingerprint_sha256 IS NULL OR octet_length(certificate_fingerprint_sha256) = 32),
  to_be_signed_sha256 bytea CHECK (to_be_signed_sha256 IS NULL OR octet_length(to_be_signed_sha256) = 32),
  signed_pdf_sha256 bytea CHECK (signed_pdf_sha256 IS NULL OR octet_length(signed_pdf_sha256) = 32),
  signed_pdf_storage_key text,
  validation_report jsonb,
  expires_at timestamptz NOT NULL,
  prepared_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((status <> 'prepared') OR (provider_session_id IS NOT NULL AND certificate_fingerprint_sha256 IS NOT NULL AND to_be_signed_sha256 IS NOT NULL)),
  CHECK ((status <> 'completed') OR (signed_pdf_sha256 IS NOT NULL AND signed_pdf_storage_key IS NOT NULL AND validation_report IS NOT NULL))
);

CREATE INDEX pades_private_tickets_expiry_idx ON pades_private_tickets (status, expires_at);

CREATE OR REPLACE FUNCTION prevent_private_ticket_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token_sha256 <> OLD.token_sha256
     OR NEW.source_pdf_sha256 <> OLD.source_pdf_sha256
     OR NEW.source_pdf_storage_key <> OLD.source_pdf_storage_key
     OR NEW.source_pdf_size <> OLD.source_pdf_size
     OR NEW.document_name <> OLD.document_name
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'private PAdES ticket identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pades_private_ticket_identity_immutable
  BEFORE UPDATE ON pades_private_tickets
  FOR EACH ROW EXECUTE FUNCTION prevent_private_ticket_identity_change();

CREATE TABLE pades_private_ticket_events (
  id bigserial PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES pades_private_tickets(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  correlation_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pades_private_ticket_events_idx ON pades_private_ticket_events (ticket_id, id);
