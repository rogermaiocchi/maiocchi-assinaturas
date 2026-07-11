BEGIN;

CREATE TABLE pki_workflows (
  id uuid PRIMARY KEY,
  account_id bigint NOT NULL,
  docuseal_submission_id bigint NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  modality text NOT NULL CHECK (modality IN ('icp_brasil', 'govbr_external')),
  status text NOT NULL CHECK (status IN ('received', 'frozen', 'awaiting_signer', 'signing', 'validating', 'completed', 'cancelled', 'expired', 'failed')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  current_signer_index integer NOT NULL DEFAULT 0 CHECK (current_signer_index >= 0),
  frozen_pdf_sha256 bytea,
  frozen_pdf_size bigint CHECK (frozen_pdf_size > 0),
  frozen_pdf_storage_key text,
  expires_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, docuseal_submission_id, revision),
  CHECK (frozen_pdf_sha256 IS NULL OR octet_length(frozen_pdf_sha256) = 32)
);

CREATE TABLE pki_signers (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES pki_workflows(id) ON DELETE RESTRICT,
  docuseal_submitter_id bigint NOT NULL,
  signer_order integer NOT NULL CHECK (signer_order >= 0),
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'signing', 'signed', 'cancelled', 'expired', 'failed')),
  certificate_fingerprint_sha256 bytea,
  validation_summary jsonb,
  signed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, signer_order),
  UNIQUE (workflow_id, docuseal_submitter_id),
  CHECK (certificate_fingerprint_sha256 IS NULL OR octet_length(certificate_fingerprint_sha256) = 32)
);

CREATE TABLE pki_sessions (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES pki_workflows(id) ON DELETE RESTRICT,
  signer_id uuid NOT NULL REFERENCES pki_signers(id) ON DELETE RESTRICT,
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  provider_state_ciphertext bytea NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared', 'used', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (signer_id, request_sha256)
);

CREATE TABLE pki_artifacts (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES pki_workflows(id) ON DELETE RESTRICT,
  signer_id uuid REFERENCES pki_signers(id) ON DELETE RESTRICT,
  previous_artifact_id uuid REFERENCES pki_artifacts(id) ON DELETE RESTRICT,
  artifact_type text NOT NULL CHECK (artifact_type IN ('docuseal_original', 'pades_revision', 'pades_final', 'validation_report')),
  revision integer NOT NULL CHECK (revision > 0),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  size bigint NOT NULL CHECK (size > 0),
  content_type text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, artifact_type, revision),
  UNIQUE (storage_key)
);

CREATE TABLE pki_webhook_receipts (
  id bigserial PRIMARY KEY,
  idempotency_key char(64) NOT NULL UNIQUE,
  event_type text NOT NULL,
  docuseal_submission_id bigint NOT NULL,
  workflow_id uuid REFERENCES pki_workflows(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pki_events (
  id bigserial PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES pki_workflows(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'operator', 'signer', 'docuseal', 'provider')),
  actor_reference text,
  previous_version integer CHECK (previous_version >= 0),
  next_version integer CHECK (next_version >= 0),
  correlation_id uuid NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (next_version IS NULL OR previous_version IS NULL OR next_version > previous_version)
);

CREATE INDEX pki_workflows_submission_idx ON pki_workflows (account_id, docuseal_submission_id);
CREATE INDEX pki_workflows_status_idx ON pki_workflows (status, updated_at);
CREATE INDEX pki_signers_workflow_status_idx ON pki_signers (workflow_id, status);
CREATE INDEX pki_sessions_expiry_idx ON pki_sessions (status, expires_at);
CREATE INDEX pki_events_workflow_idx ON pki_events (workflow_id, id);

COMMIT;
