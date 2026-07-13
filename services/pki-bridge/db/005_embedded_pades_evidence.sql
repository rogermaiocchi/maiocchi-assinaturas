ALTER TABLE pades_private_tickets
  ADD COLUMN public_id varchar(32),
  ADD COLUMN document_number varchar(40),
  ADD COLUMN document_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN source_page_count integer,
  ADD COLUMN presentation_pdf_sha256 bytea,
  ADD COLUMN presentation_pdf_storage_key text,
  ADD COLUMN presentation_pdf_size bigint,
  ADD COLUMN presentation_page_count integer,
  ADD COLUMN evidence_page_storage_key text,
  ADD COLUMN evidence_page_sha256 bytea,
  ADD COLUMN evidence_page_size bigint,
  ADD COLUMN evidence_manifest jsonb,
  ADD COLUMN pqc_attestation jsonb,
  ADD COLUMN pqc_key_id text,
  ADD COLUMN pqc_code text,
  ADD COLUMN final_evidence_manifest jsonb,
  ADD COLUMN final_pqc_attestation jsonb,
  ADD COLUMN final_pqc_code text,
  ADD COLUMN signing_metadata jsonb,
  ADD COLUMN signed_pdf_size bigint;

ALTER TABLE pades_private_tickets
  ADD CONSTRAINT pades_private_public_id_format
    CHECK (public_id IS NULL OR public_id ~ '^MAI-[0-9]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$'),
  ADD CONSTRAINT pades_private_document_number_format
    CHECK (document_number IS NULL OR document_number ~ '^[0-9]{29}$'),
  ADD CONSTRAINT pades_private_source_page_count_positive
    CHECK (source_page_count IS NULL OR source_page_count > 0),
  ADD CONSTRAINT pades_private_presentation_sha256_length
    CHECK (presentation_pdf_sha256 IS NULL OR octet_length(presentation_pdf_sha256) = 32),
  ADD CONSTRAINT pades_private_presentation_size_positive
    CHECK (presentation_pdf_size IS NULL OR presentation_pdf_size > 0),
  ADD CONSTRAINT pades_private_presentation_pages_positive
    CHECK (presentation_page_count IS NULL OR presentation_page_count > 1),
  ADD CONSTRAINT pades_private_evidence_sha256_length
    CHECK (evidence_page_sha256 IS NULL OR octet_length(evidence_page_sha256) = 32),
  ADD CONSTRAINT pades_private_evidence_size_positive
    CHECK (evidence_page_size IS NULL OR evidence_page_size > 0),
  ADD CONSTRAINT pades_private_signed_size_positive
    CHECK (signed_pdf_size IS NULL OR signed_pdf_size > 0),
  ADD CONSTRAINT pades_private_evidence_complete
    CHECK ((presentation_pdf_sha256 IS NULL AND presentation_pdf_storage_key IS NULL AND presentation_pdf_size IS NULL
            AND presentation_page_count IS NULL AND evidence_page_storage_key IS NULL AND evidence_page_sha256 IS NULL
            AND evidence_page_size IS NULL AND evidence_manifest IS NULL
            AND pqc_attestation IS NULL AND pqc_key_id IS NULL AND pqc_code IS NULL AND signing_metadata IS NULL)
        OR (presentation_pdf_sha256 IS NOT NULL AND presentation_pdf_storage_key IS NOT NULL AND presentation_pdf_size IS NOT NULL
            AND presentation_page_count IS NOT NULL AND evidence_page_storage_key IS NOT NULL AND evidence_page_sha256 IS NOT NULL
            AND evidence_page_size IS NOT NULL AND evidence_manifest IS NOT NULL
            AND pqc_attestation IS NOT NULL AND pqc_key_id IS NOT NULL AND pqc_code IS NOT NULL AND signing_metadata IS NOT NULL));

CREATE UNIQUE INDEX pades_private_tickets_public_id_idx
  ON pades_private_tickets (public_id) WHERE public_id IS NOT NULL;
CREATE UNIQUE INDEX pades_private_tickets_document_number_idx
  ON pades_private_tickets (document_number) WHERE document_number IS NOT NULL;
CREATE UNIQUE INDEX pades_private_tickets_pqc_code_idx
  ON pades_private_tickets (pqc_code) WHERE pqc_code IS NOT NULL;
CREATE UNIQUE INDEX pades_private_tickets_final_pqc_code_idx
  ON pades_private_tickets (final_pqc_code) WHERE final_pqc_code IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_private_ticket_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token_sha256 IS DISTINCT FROM OLD.token_sha256
     OR NEW.source_pdf_sha256 IS DISTINCT FROM OLD.source_pdf_sha256
     OR NEW.source_pdf_storage_key IS DISTINCT FROM OLD.source_pdf_storage_key
     OR NEW.source_pdf_size IS DISTINCT FROM OLD.source_pdf_size
     OR NEW.document_name IS DISTINCT FROM OLD.document_name
     OR NEW.public_id IS DISTINCT FROM OLD.public_id
     OR NEW.document_number IS DISTINCT FROM OLD.document_number
     OR NEW.document_context IS DISTINCT FROM OLD.document_context
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'private PAdES ticket identity is immutable';
  END IF;
  IF OLD.presentation_pdf_storage_key IS NOT NULL AND (
       NEW.source_page_count IS DISTINCT FROM OLD.source_page_count
       OR NEW.presentation_pdf_sha256 IS DISTINCT FROM OLD.presentation_pdf_sha256
       OR NEW.presentation_pdf_storage_key IS DISTINCT FROM OLD.presentation_pdf_storage_key
       OR NEW.presentation_pdf_size IS DISTINCT FROM OLD.presentation_pdf_size
       OR NEW.presentation_page_count IS DISTINCT FROM OLD.presentation_page_count
       OR NEW.evidence_page_storage_key IS DISTINCT FROM OLD.evidence_page_storage_key
       OR NEW.evidence_page_sha256 IS DISTINCT FROM OLD.evidence_page_sha256
       OR NEW.evidence_page_size IS DISTINCT FROM OLD.evidence_page_size
       OR NEW.evidence_manifest IS DISTINCT FROM OLD.evidence_manifest
       OR NEW.pqc_attestation IS DISTINCT FROM OLD.pqc_attestation
       OR NEW.pqc_key_id IS DISTINCT FROM OLD.pqc_key_id
       OR NEW.pqc_code IS DISTINCT FROM OLD.pqc_code
       OR NEW.signing_metadata IS DISTINCT FROM OLD.signing_metadata) THEN
    RAISE EXCEPTION 'private PAdES evidence is immutable once prepared';
  END IF;
  IF OLD.final_pqc_attestation IS NOT NULL AND (
       NEW.final_evidence_manifest IS DISTINCT FROM OLD.final_evidence_manifest
       OR NEW.final_pqc_attestation IS DISTINCT FROM OLD.final_pqc_attestation
       OR NEW.final_pqc_code IS DISTINCT FROM OLD.final_pqc_code) THEN
    RAISE EXCEPTION 'private PAdES final attestation is immutable';
  END IF;
  IF OLD.status = 'completed' AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.signed_pdf_sha256 IS DISTINCT FROM OLD.signed_pdf_sha256
       OR NEW.signed_pdf_storage_key IS DISTINCT FROM OLD.signed_pdf_storage_key
       OR NEW.signed_pdf_size IS DISTINCT FROM OLD.signed_pdf_size
       OR NEW.validation_report IS DISTINCT FROM OLD.validation_report
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at) THEN
    RAISE EXCEPTION 'private PAdES final result is immutable';
  END IF;
  RETURN NEW;
END;
$$;
