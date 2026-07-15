import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const backup = await readFile(new URL("../scripts/backup-signature-vps.sh", import.meta.url), "utf8");
const offsite = await readFile(new URL("../scripts/pull-signature-backup-macbook.sh", import.meta.url), "utf8");
const retention = await readFile(new URL("../scripts/run-signature-retention-vps.sh", import.meta.url), "utf8");
const retentionService = await readFile(new URL("../deploy/systemd/maiocchi-signature-retention.service", import.meta.url), "utf8");
const retentionTimer = await readFile(new URL("../deploy/systemd/maiocchi-signature-retention.timer", import.meta.url), "utf8");
const portalDockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");

test("build do portal mantém telemetria Next.js desabilitada", () => {
  assert.match(portalDockerfile, /ENV NEXT_TELEMETRY_DISABLED=1/);
});

test("backup quiesce escritores antes dos dumps e publica sucesso somente após reinício", () => {
  const stop = backup.indexOf('docker stop --time 45');
  const firstDump = backup.indexOf('pg_dump');
  const restart = backup.lastIndexOf('restart_containers');
  const success = backup.indexOf('mv "$marker_tmp" "$LAST_SUCCESS_FILE"');
  assert.ok(stop > 0 && stop < firstDump);
  assert.ok(restart > firstDump && restart < success);
  assert.match(backup, /format=maiocchi-signature-backup-v2/);
  assert.match(backup, /consistency=application-writers-quiesced/);
  assert.match(backup, /age -R "\$AGE_RECIPIENT_FILE"/);
  assert.match(backup, /sha256sum --check SHA256SUMS/);
});

test("cópia externa valida ciphertext e prova decriptação antes de confirmar o ID", () => {
  const hashes = offsite.indexOf("shasum -a 256 -c SHA256SUMS");
  const decrypt = offsite.indexOf('age --decrypt -i "$AGE_IDENTITY_FILE"');
  const confirmation = offsite.indexOf(".offsite-success.tmp");
  assert.ok(hashes > 0 && hashes < decrypt && decrypt < confirmation);
  assert.match(offsite, /RESTORE_PROBE=manifest-decrypted-in-memory/);
  assert.match(offsite, /if \[\[ "\$legal_hold" != "true" \]\]/);
});

test("retenção exige legal hold livre, backup externo atual e bridge quiescido", () => {
  const hold = retention.indexOf('[[ -e "$LEGAL_HOLD_FILE" ]]');
  const offsiteMatch = retention.indexOf('"$offsite_id" == "$backup_id"');
  const stop = retention.indexOf("docker stop --time 45 pki-bridge");
  const authorization = retention.indexOf("RETENTION_ARTIFACT_DELETE_ALLOWED=true");
  assert.ok(hold > 0 && hold < offsiteMatch && offsiteMatch < stop && stop < authorization);
  assert.match(retention, /sha256sum --check SHA256SUMS/);
  assert.match(retention, /docker exec -w \/app docuseal bin\/rails/);
  assert.match(retention, /RETENTION_QUEUE_CUTOFF=\$queue_cutoff/);
  assert.match(retentionService, /OFFSITE_SUCCESS_FILE=.*signature-backup-export\/\.offsite-success/);
  assert.match(retentionTimer, /OnCalendar=hourly/);
});
