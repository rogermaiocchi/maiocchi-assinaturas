CREATE TABLE authenticity_documents (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL UNIQUE REFERENCES pki_workflows(id) ON DELETE RESTRICT,
  registration_key char(64) NOT NULL UNIQUE CHECK (registration_key ~ '^[a-f0-9]{64}$'),
  public_id varchar(32) NOT NULL UNIQUE CHECK (public_id ~ '^MAI-[0-9]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE authenticity_records (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES authenticity_documents(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  original_storage_key text NOT NULL,
  validation_report_storage_key text NOT NULL,
  validator_attestation_storage_key text NOT NULL,
  representation_storage_key text NOT NULL,
  envelope_storage_key text NOT NULL,
  envelope jsonb NOT NULL,
  envelope_sha256 bytea NOT NULL CHECK (octet_length(envelope_sha256) = 32),
  jws_compact text NOT NULL,
  signing_key_id text NOT NULL,
  validator_attestation text NOT NULL,
  validator_key_id text NOT NULL,
  finalized_at timestamptz NOT NULL,
  validated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, revision),
  UNIQUE (envelope_sha256)
);

CREATE TABLE authenticity_document_states (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES authenticity_documents(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL REFERENCES authenticity_records(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'superseded')),
  reason text NOT NULL,
  previous_state_sha256 bytea CHECK (previous_state_sha256 IS NULL OR octet_length(previous_state_sha256) = 32),
  state_sha256 bytea NOT NULL CHECK (octet_length(state_sha256) = 32),
  created_at timestamptz NOT NULL,
  UNIQUE (document_id, state_sha256)
);

CREATE TABLE authenticity_signatures (
  id uuid PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES authenticity_records(id) ON DELETE RESTRICT,
  signature_index integer NOT NULL CHECK (signature_index >= 0),
  certificate_fingerprint_sha256 bytea NOT NULL CHECK (octet_length(certificate_fingerprint_sha256) = 32),
  pades_profile text NOT NULL CHECK (pades_profile IN ('AD-RB', 'AD-RT')),
  policy_oid text NOT NULL,
  signing_time timestamptz NOT NULL,
  timestamp_time timestamptz,
  chain_status text NOT NULL CHECK (chain_status = 'valid'),
  revocation_status text NOT NULL CHECK (revocation_status = 'good'),
  validation_status text NOT NULL CHECK (validation_status = 'valid'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, signature_index)
);

CREATE TABLE authenticity_hashes (
  id uuid PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES authenticity_records(id) ON DELETE RESTRICT,
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('original_pades', 'validation_report', 'validation_attestation', 'print_representation', 'authenticity_envelope')),
  algorithm text NOT NULL CHECK (algorithm = 'SHA-256'),
  digest bytea NOT NULL CHECK (octet_length(digest) = 32),
  byte_length bigint NOT NULL CHECK (byte_length > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, artifact_kind)
);

CREATE TABLE authenticity_audit_events (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES authenticity_documents(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL REFERENCES authenticity_records(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('record_created', 'document_revoked', 'document_superseded')),
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure', 'denied')),
  correlation_id uuid NOT NULL,
  previous_event_sha256 bytea CHECK (previous_event_sha256 IS NULL OR octet_length(previous_event_sha256) = 32),
  event_sha256 bytea NOT NULL CHECK (octet_length(event_sha256) = 32),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, event_sha256)
);

CREATE TABLE authenticity_verification_events (
  id bigserial PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES authenticity_documents(id) ON DELETE RESTRICT,
  record_id uuid NOT NULL REFERENCES authenticity_records(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('hash_matched', 'hash_mismatched')),
  outcome text NOT NULL CHECK (outcome IN ('success', 'failure')),
  correlation_id uuid NOT NULL,
  trust_level text NOT NULL DEFAULT 'untrusted_client_observation' CHECK (trust_level = 'untrusted_client_observation'),
  observation_window timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, event_type, observation_window)
);

CREATE INDEX authenticity_documents_public_idx ON authenticity_documents (public_id);
CREATE INDEX authenticity_records_document_idx ON authenticity_records (document_id, revision DESC);
CREATE INDEX authenticity_states_document_idx ON authenticity_document_states (document_id, id DESC);
CREATE INDEX authenticity_audit_document_idx ON authenticity_audit_events (document_id, id DESC);
CREATE INDEX authenticity_verification_document_idx ON authenticity_verification_events (document_id, id DESC);

CREATE OR REPLACE FUNCTION reject_authenticity_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'authenticity evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER authenticity_records_immutable
  BEFORE UPDATE OR DELETE ON authenticity_records
  FOR EACH ROW EXECUTE FUNCTION reject_authenticity_mutation();
CREATE TRIGGER authenticity_signatures_immutable
  BEFORE UPDATE OR DELETE ON authenticity_signatures
  FOR EACH ROW EXECUTE FUNCTION reject_authenticity_mutation();
CREATE TRIGGER authenticity_hashes_immutable
  BEFORE UPDATE OR DELETE ON authenticity_hashes
  FOR EACH ROW EXECUTE FUNCTION reject_authenticity_mutation();
CREATE TRIGGER authenticity_documents_immutable
  BEFORE UPDATE OR DELETE ON authenticity_documents
  FOR EACH ROW EXECUTE FUNCTION reject_authenticity_mutation();
CREATE TRIGGER authenticity_states_immutable
  BEFORE UPDATE OR DELETE ON authenticity_document_states
  FOR EACH ROW EXECUTE FUNCTION reject_authenticity_mutation();
CREATE TRIGGER authenticity_audit_events_immutable
  BEFORE UPDATE OR DELETE ON authenticity_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_authenticity_mutation();
CREATE TRIGGER authenticity_verification_events_immutable
  BEFORE UPDATE OR DELETE ON authenticity_verification_events
  FOR EACH ROW EXECUTE FUNCTION reject_authenticity_mutation();
