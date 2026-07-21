#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, closeSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function fail(message) {
  process.stderr.write(`ERRO: ${message}\n`);
  process.exit(1);
}

if (process.argv.length !== 6) {
  fail('Uso: finalize-sso-e2e-teardown.mjs DIRETORIO PROJETO FINGERPRINT-ANTES FINGERPRINT-DEPOIS');
}

const [, , rawDirectory, projectName, beforeFingerprint, afterFingerprint] = process.argv;
const directory = resolve(rawDirectory);
const sha256Pattern = /^[0-9a-f]{64}$/;
const runIdMatch = /^maiocchi-sso-([0-9a-f]{12}-a[0-9]{2})$/.exec(projectName);
if (!runIdMatch) fail('nome do projeto E2E inválido');
if (process.getuid?.() !== 0) fail('finalização do teardown E2E exige root');
if (!sha256Pattern.test(beforeFingerprint) || !sha256Pattern.test(afterFingerprint)) {
  fail('fingerprint de produção inválido');
}
if (beforeFingerprint !== afterFingerprint) fail('fingerprint de produção mudou após o teardown');

function readGovernedJson(name) {
  const path = join(directory, name);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o400 || metadata.uid !== 0 || metadata.gid !== 0) {
    fail(`${name} não é evidência regular 0400`);
  }
  if (metadata.size < 2 || metadata.size > 128 * 1024) fail(`${name} possui tamanho inválido`);
  const bytes = readFileSync(path);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail(`${name} não contém JSON válido`); }
  return { bytes, value, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function readGovernedArtifact(name) {
  const path = join(directory, name);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o400 || metadata.uid !== 0 || metadata.gid !== 0) {
    fail(`${name} não é evidência regular 0400`);
  }
  if (metadata.size < 2 || metadata.size > 128 * 1024) fail(`${name} possui tamanho inválido`);
  const bytes = readFileSync(path);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function requireAbsent(path, label) {
  try {
    lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    fail(`não foi possível auditar ausência de ${label}`);
  }
  fail(`${label} permaneceu após o teardown`);
}

function dockerIds(kind, args) {
  const result = spawnSync('docker', [kind, 'ls', '--quiet', ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 128 * 1024,
  });
  if (result.error || result.status !== 0) fail(`não foi possível auditar recursos Docker ${kind}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function inspect(format, target, label) {
  const result = spawnSync('docker', ['inspect', '--format', format, target], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 128 * 1024,
  });
  if (result.error || result.status !== 0) fail(`não foi possível auditar ${label}`);
  return result.stdout.trim();
}

const runtime = readGovernedJson('sso-e2e-runtime-envelope.json');
const protocol = readGovernedJson('probe-output/sso-e2e-result.json');
const databaseResult = readGovernedArtifact('probe-output/sso-e2e-db-result.txt');
const protocolManifest = readGovernedJson('sso-e2e-protocol-manifest.json');
if (runtime.value.run_id !== runIdMatch[1] || protocolManifest.value.run_id !== runIdMatch[1]) {
  fail('run_id diverge entre projeto e evidências');
}
if (
  protocolManifest.value.schema !== 'maiocchi.sso-e2e-evidence-manifest.v1'
  || protocolManifest.value.artifacts?.runtime_envelope?.sha256 !== runtime.sha256
  || protocolManifest.value.artifacts?.protocol_result?.sha256 !== protocol.sha256
  || protocolManifest.value.artifacts?.database_result?.sha256 !== databaseResult.sha256
  || protocolManifest.value.production_fingerprint_before !== beforeFingerprint
  || protocolManifest.value.production_fingerprint_after !== beforeFingerprint
) fail('manifesto de protocolo não está vinculado ao mesmo ensaio');

const projectFilter = ['--filter', `label=com.docker.compose.project=${projectName}`];
const remaining = {
  containers: dockerIds('container', ['--all', ...projectFilter]),
  networks: dockerIds('network', projectFilter),
  volumes: dockerIds('volume', projectFilter),
};
if (Object.values(remaining).some((ids) => ids.length !== 0)) {
  fail('recursos Docker do projeto E2E permaneceram após o teardown');
}
requireAbsent(`/run/${projectName}`, 'runtime efêmero de secrets/PKI');
requireAbsent(`/run/lock/${projectName}.lock`, 'lock da execução E2E');

const uno = runtime.value.uno_runtime;
const unoNetworkId = inspect('{{.Id}}', uno.network.name, 'rede UNO externa');
if (unoNetworkId !== uno.network.id) fail('rede UNO externa mudou durante o ensaio');
for (const [service, expected] of [['portal', uno.portal], ['api', uno.api]]) {
  const state = inspect('{{.Id}}|{{.Image}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', expected.container_id, `serviço UNO ${service}`);
  if (state !== `${expected.container_id}|${expected.image_id}|true|healthy`) {
    fail(`serviço UNO ${service} mudou ou deixou de estar saudável`);
  }
}
const unoDataNetworkId = inspect('{{.Id}}', uno.data_network.name, 'rede de dados UNO externa');
if (unoDataNetworkId !== uno.data_network.id) fail('rede de dados UNO externa mudou durante o ensaio');
const databaseState = inspect('{{.Id}}|{{.Image}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', uno.database.container_id, 'PostgreSQL UNO');
if (databaseState !== `${uno.database.container_id}|${uno.database.image_id}|true|healthy`) {
  fail('PostgreSQL UNO mudou ou deixou de estar saudável');
}

const teardown = {
  schema: 'maiocchi.sso-e2e-teardown.v1',
  generated_at: new Date().toISOString(),
  run_id: runIdMatch[1],
  project_name: projectName,
  data_class: 'synthetic-only',
  public_exposure: false,
  project_resources_remaining: { containers: 0, networks: 0, volumes: 0 },
  ephemeral_host_materials_remaining: { runtime: false, lock: false },
  external_uno_container_topology_preserved: true,
  allowed_uno_state_mutation: protocolManifest.value.allowed_uno_state_mutation,
  production_fingerprint_before: beforeFingerprint,
  production_fingerprint_after_teardown: afterFingerprint,
  production_scope: ['assinatura-portal', 'docuseal', 'docuseal-db', 'pades-provider', 'pki-bridge', 'pki-db'],
};

function writeExclusive(name, value) {
  const path = join(directory, name);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o400);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const bytes = readFileSync(path);
  return { path: name, sha256: createHash('sha256').update(bytes).digest('hex') };
}

const teardownArtifact = writeExclusive('sso-e2e-teardown.json', teardown);
writeExclusive('sso-e2e-final-manifest.json', {
  schema: 'maiocchi.sso-e2e-final-manifest.v1',
  generated_at: new Date().toISOString(),
  run_id: runIdMatch[1],
  data_class: 'synthetic-only',
  public_exposure: false,
  production_invariant: true,
  production_scope: ['assinatura-portal', 'docuseal', 'docuseal-db', 'pades-provider', 'pki-bridge', 'pki-db'],
  signature_recipe: runtime.value.signature_recipe,
  signature_images: runtime.value.signature_images,
  lab_images: runtime.value.lab_images,
  uno_recipe: runtime.value.uno_recipe,
  external_uno_container_topology_preserved: true,
  allowed_uno_state_mutation: protocolManifest.value.allowed_uno_state_mutation,
  artifacts: {
    runtime_envelope: { path: 'sso-e2e-runtime-envelope.json', sha256: runtime.sha256 },
    protocol_result: { path: 'probe-output/sso-e2e-result.json', sha256: protocol.sha256 },
    database_result: { path: 'probe-output/sso-e2e-db-result.txt', sha256: databaseResult.sha256 },
    protocol_manifest: { path: 'sso-e2e-protocol-manifest.json', sha256: protocolManifest.sha256 },
    teardown: teardownArtifact,
  },
});

process.stdout.write('Teardown E2E: zero recursos residuais, UNO preservado e produção invariável PASS\n');
