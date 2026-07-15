export class MemoryInternalReplayGuard {
  constructor() { this.nonces = new Map(); }

  async consume({ nonce, expiresAt }) {
    const now = Date.now();
    for (const [value, expiry] of this.nonces) if (expiry <= now) this.nonces.delete(value);
    const expiry = expiresAt instanceof Date ? expiresAt.getTime() : Number.NaN;
    if (!Number.isFinite(expiry) || expiry <= now) return false;
    if (this.nonces.has(nonce)) return false;
    this.nonces.set(nonce, expiry);
    return true;
  }
}

export class PostgresInternalReplayGuard {
  constructor(pool) { this.pool = pool; }

  async consume({ nonce, timestamp, expiresAt }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM internal_request_nonces WHERE expires_at <= now()");
      const result = await client.query(
        `INSERT INTO internal_request_nonces (nonce, request_timestamp, expires_at)
         SELECT $1, to_timestamp($2), $3::timestamptz
         WHERE $3::timestamptz > now()
         ON CONFLICT (nonce) DO NOTHING
         RETURNING nonce`,
        [nonce, Number(timestamp), expiresAt],
      );
      await client.query("COMMIT");
      return result.rowCount === 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
