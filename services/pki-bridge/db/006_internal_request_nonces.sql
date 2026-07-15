CREATE TABLE internal_request_nonces (
  nonce char(32) PRIMARY KEY CHECK (nonce ~ '^[a-f0-9]{32}$'),
  request_timestamp timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > request_timestamp)
);

CREATE INDEX internal_request_nonces_expiry_idx ON internal_request_nonces (expires_at);
