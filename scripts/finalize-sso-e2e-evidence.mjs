#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants, lstatSync, openSync, readFileSync, readdirSync, writeFileSync, closeSync, fsyncSync } from 'node:fs';
import { join, resolve } from 'node:path';

function fail(message) {
  process.stderr.write(`ERRO: ${message}\n`);
  process.exit(1);
}

if (process.argv.length !== 5) {
  fail('Uso: finalize-sso-e2e-evidence.mjs DIRETORIO FINGERPRINT-ANTES FINGERPRINT-DEPOIS');
}
if (process.getuid?.() !== 0) fail('finalização da evidência E2E exige root');

const [, , rawDirectory, beforeFingerprint, afterFingerprint] = process.argv;
const directory = resolve(rawDirectory);
const sha256Pattern = /^[0-9a-f]{64}$/;
if (!sha256Pattern.test(beforeFingerprint) || !sha256Pattern.test(afterFingerprint)) {
  fail('fingerprint de produção inválido');
}
if (beforeFingerprint !== afterFingerprint) fail('fingerprint de produção mudou durante o E2E');

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
  return { path, bytes, value, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function readGovernedText(name) {
  const path = join(directory, name);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o400 || metadata.uid !== 0 || metadata.gid !== 0) {
    fail(`${name} não é evidência regular root:root 0400`);
  }
  if (metadata.size < 2 || metadata.size > 16 * 1024) fail(`${name} possui tamanho inválido`);
  const bytes = readFileSync(path);
  const value = bytes.toString('utf8');
  return { path, bytes, value, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} não é objeto`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${label} possui campos divergentes`);
}

function validIsoTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function requirePattern(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${label} diverge do contrato`);
}

const runtime = readGovernedJson('sso-e2e-runtime-envelope.json');
const protocol = readGovernedJson('probe-output/sso-e2e-result.json');
const databaseResult = readGovernedText('probe-output/sso-e2e-db-result.txt');

exactKeys(runtime.value, [
  'schema', 'generated_at', 'run_id', 'data_class', 'public_exposure',
  'signature_recipe', 'signature_images', 'lab_images', 'uno_recipe', 'uno_runtime',
  'tls_certificate_sha256', 'trust_policy_sha256', 'source_bindings',
], 'runtime envelope');
if (
  runtime.value.schema !== 'maiocchi.sso-e2e-runtime-envelope.v1'
  || runtime.value.data_class !== 'synthetic-only'
  || runtime.value.public_exposure !== false
  || !/^[0-9a-f]{12}-a[0-9]{2}$/.test(runtime.value.run_id || '')
  || !validIsoTimestamp(runtime.value.generated_at)
) fail('runtime envelope diverge do contrato');

const imageIdPattern = /^sha256:[0-9a-f]{64}$/;
exactKeys(runtime.value.signature_recipe, ['commit', 'tree'], 'signature recipe');
exactKeys(runtime.value.uno_recipe, ['commit', 'tree'], 'UNO recipe');
for (const [label, recipe] of [['signature', runtime.value.signature_recipe], ['UNO', runtime.value.uno_recipe]]) {
  requirePattern(recipe.commit, /^[0-9a-f]{40}$/, `${label} commit`);
  requirePattern(recipe.tree, /^[0-9a-f]{40}$/, `${label} tree`);
}
exactKeys(runtime.value.signature_images, ['portal', 'docuseal'], 'signature images');
requirePattern(runtime.value.signature_images.portal, imageIdPattern, 'portal image ID');
requirePattern(runtime.value.signature_images.docuseal, imageIdPattern, 'DocuSeal image ID');
exactKeys(runtime.value.lab_images, ['http_probe', 'database_verifier', 'tls_gateway'], 'lab images');
const expectedLabReferences = {
  http_probe: 'ruby@sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6',
  database_verifier: 'postgres@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777',
  tls_gateway: 'nginxinc/nginx-unprivileged@sha256:3b24c4bfb2b9f60359b1475605ca1c8ed6e4963eb8369c6835be4d96bdb3ea81',
};
for (const [name, reference] of Object.entries(expectedLabReferences)) {
  exactKeys(runtime.value.lab_images[name], ['reference', 'image_id'], `lab image ${name}`);
  if (runtime.value.lab_images[name].reference !== reference) fail(`lab image ${name} reference diverge`);
  requirePattern(runtime.value.lab_images[name].image_id, imageIdPattern, `lab image ${name} ID`);
}
requirePattern(runtime.value.tls_certificate_sha256, sha256Pattern, 'certificado TLS');
requirePattern(runtime.value.trust_policy_sha256, sha256Pattern, 'política de trust');

exactKeys(runtime.value.uno_runtime, ['network', 'data_network', 'portal', 'api', 'database'], 'UNO runtime');
for (const [label, network] of [['UNO internal network', runtime.value.uno_runtime.network], ['UNO data network', runtime.value.uno_runtime.data_network]]) {
  exactKeys(network, ['name', 'id'], label);
  requirePattern(network.id, /^[0-9a-f]{64}$/, `${label} ID`);
}
requirePattern(runtime.value.uno_runtime.network.name, /^maiocchi-uno-canary-(blue|green)_canary-internal$/, 'UNO internal network name');
requirePattern(runtime.value.uno_runtime.data_network.name, /^maiocchi-uno-canary-(blue|green)-data$/, 'UNO data network name');
for (const [label, service] of [['UNO portal', runtime.value.uno_runtime.portal], ['UNO API', runtime.value.uno_runtime.api]]) {
  exactKeys(service, ['container_id', 'image_id'], label);
  requirePattern(service.container_id, /^[0-9a-f]{64}$/, `${label} container ID`);
  requirePattern(service.image_id, imageIdPattern, `${label} image ID`);
}
exactKeys(runtime.value.uno_runtime.database, ['container_id', 'image_id', 'database', 'user'], 'UNO database');
requirePattern(runtime.value.uno_runtime.database.container_id, /^[0-9a-f]{64}$/, 'UNO DB container ID');
requirePattern(runtime.value.uno_runtime.database.image_id, imageIdPattern, 'UNO DB image ID');

const sourcePaths = {
  portal_compose_sha256: 'deploy/portal-sso.candidate.yml',
  docuseal_compose_sha256: 'deploy/docuseal-sso.candidate.yml',
  gateway_compose_sha256: 'deploy/sso-e2e-gateway.candidate.yml',
  gateway_config_sha256: 'deploy/sso-e2e/gateway.conf',
  docuseal_bootstrap_sha256: 'deploy/sso-e2e/docuseal-sso-bootstrap.rb',
  protocol_probe_sha256: 'deploy/sso-e2e/sso-e2e-probe.rb',
  database_verifier_sha256: 'deploy/sso-e2e/verify-docuseal-sso-db.sh',
  runner_sha256: 'scripts/run-sso-candidate-compose.sh',
  runtime_preflight_sha256: 'scripts/validate-sso-e2e-runtime.sh',
  pki_generator_sha256: 'scripts/generate-sso-e2e-canary-pki.sh',
  secret_provisioner_sha256: 'scripts/provision-docuseal-sso-canary-secret.sh',
  evidence_finalizer_sha256: 'scripts/finalize-sso-e2e-evidence.mjs',
  teardown_finalizer_sha256: 'scripts/finalize-sso-e2e-teardown.mjs',
};
exactKeys(runtime.value.source_bindings, Object.keys(sourcePaths), 'source bindings');
for (const [field, relativePath] of Object.entries(sourcePaths)) {
  requirePattern(runtime.value.source_bindings[field], sha256Pattern, field);
  const stagedPath = join(directory, 'recipe-stage', relativePath);
  const metadata = lstatSync(stagedPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o444 || metadata.uid !== 0 || metadata.gid !== 0) {
    fail(`staging divergente: ${relativePath}`);
  }
  const actual = createHash('sha256').update(readFileSync(stagedPath)).digest('hex');
  if (actual !== runtime.value.source_bindings[field]) fail(`hash staged diverge: ${relativePath}`);
}
const probeOutputEntries = readdirSync(join(directory, 'probe-output')).sort();
if (JSON.stringify(probeOutputEntries) !== JSON.stringify(['sso-e2e-db-result.txt', 'sso-e2e-result.json'])) {
  fail('diretório de saída do probe possui conteúdo divergente');
}

exactKeys(protocol.value, [
  'schema', 'generated_at', 'data_class', 'public_exposure', 'execution_surface',
  'tls_verification', 'runtime_envelope_sha256', 'docuseal_flow_cookie_seen',
  'subject', 'account_uuid', 'direct_exchange_id', 'steps',
], 'protocol result');
if (
  protocol.value.schema !== 'maiocchi.sso-protocol-e2e-result.v1'
  || protocol.value.data_class !== 'synthetic-only'
  || protocol.value.public_exposure !== false
  || protocol.value.execution_surface !== 'cookie-aware HTTPS protocol probe; browser QA is a separate gate'
  || protocol.value.tls_verification !== 'private-ca-verify-peer'
  || protocol.value.runtime_envelope_sha256 !== runtime.sha256
  || protocol.value.docuseal_flow_cookie_seen !== true
  || protocol.value.subject !== '11111111-1111-4111-8111-111111111111'
  || protocol.value.account_uuid !== '33333333-3333-4333-8333-333333333333'
  || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(protocol.value.direct_exchange_id || '')
  || !validIsoTimestamp(protocol.value.generated_at)
) fail('protocol result diverge do contrato');

const expectedSteps = [
  ['signature_portal_entry', { status: 200 }],
  ['docuseal_pkce_start', { status: 303 }],
  ['uno_synthetic_staff_login', { status: 200 }],
  ['uno_authorization_code', { status: 303 }],
  ['docuseal_code_exchange', { status: 303 }],
  ['docuseal_authenticated_dashboard', { status: 200 }],
  ['docuseal_callback_replay_rejected', { status: 422 }],
  ['uno_token_replay_rejected', { first_status: 200, replay_status: 400 }],
];
if (!Array.isArray(protocol.value.steps) || protocol.value.steps.length !== expectedSteps.length) {
  fail('quantidade de passos do protocolo diverge');
}

const databaseFields = databaseResult.value.trimEnd().split('|');
if (
  databaseFields.length !== 12
  || databaseFields[0] !== 'maiocchi.docuseal-sso-db-result.v1'
  || databaseFields[1] !== 'maiocchi_uno'
  || databaseFields[2] !== '11111111-1111-4111-8111-111111111111'
  || databaseFields[3] !== '33333333-3333-4333-8333-333333333333'
  || databaseFields[4] !== 'staff.canary@example.invalid'
  || databaseFields[5] !== 'admin'
  || databaseFields[6] !== 'staff.canary@example.invalid'
  || databaseFields[7] !== 'admin'
  || databaseFields.slice(8, 11).some((value) => value !== '1')
  || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(databaseFields[11])
) fail('resultado do verificador DB independente diverge do contrato');
const docusealExchangeId = databaseFields[11];
if (docusealExchangeId === protocol.value.direct_exchange_id) fail('exchange IDs dos dois fluxos não são distintos');

const databaseRuntime = runtime.value.uno_runtime?.database;
if (
  !databaseRuntime
  || !/^[0-9a-f]{64}$/.test(databaseRuntime.container_id || '')
  || !/^sha256:[0-9a-f]{64}$/.test(databaseRuntime.image_id || '')
  || !/^maiocchi_uno_(blue|green)_synthetic_canary$/.test(databaseRuntime.database || '')
  || databaseRuntime.user !== 'maiocchi_canary_admin'
) fail('runtime PostgreSQL UNO diverge do contrato');

const exchangeIds = [docusealExchangeId, protocol.value.direct_exchange_id].sort();
const quotedIds = exchangeIds.map((value) => `'${value}'`).join(',');
const ledgerSql = [
  "SELECT exchange_id::text, user_id::text, client_id, scope, audience, redirect_uri,",
  "       (consumed_em IS NOT NULL)::text",
  "  FROM lis.sso_authorization_codes",
  ` WHERE exchange_id IN (${quotedIds})`,
  " ORDER BY exchange_id;",
].join('\n');
const ledgerQuery = spawnSync('docker', [
  'exec', databaseRuntime.container_id, 'psql',
  '--host=/run/postgresql', `--username=${databaseRuntime.user}`,
  `--dbname=${databaseRuntime.database}`, '-X', '--no-password',
  '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--field-separator=|',
  '--command', ledgerSql,
], { encoding: 'utf8', timeout: 30_000, maxBuffer: 128 * 1024 });
if (ledgerQuery.error || ledgerQuery.status !== 0) fail('consulta independente ao ledger UNO falhou');
const ledgerRows = ledgerQuery.stdout.trim().split(/\r?\n/).filter(Boolean);
if (ledgerRows.length !== 2) fail('ledger UNO não contém exatamente as duas mutações esperadas');
for (let index = 0; index < ledgerRows.length; index += 1) {
  const fields = ledgerRows[index].split('|');
  if (
    fields.length !== 7
    || fields[0] !== exchangeIds[index]
    || fields[1] !== '11111111-1111-4111-8111-111111111111'
    || fields[2] !== 'maiocchi-signature'
    || fields[3] !== 'openid profile signature.manage'
    || fields[4] !== 'maiocchi-signature'
    || fields[5] !== 'https://assinatura-canary.maiocchi.adv.br/sso/maiocchi/callback'
    || fields[6] !== 'true'
  ) fail('mutações do ledger UNO divergem do contrato permitido');
}
for (let index = 0; index < expectedSteps.length; index += 1) {
  const [stepName, details] = expectedSteps[index];
  const actual = protocol.value.steps[index];
  if (actual?.step !== stepName || actual?.ok !== true) fail(`passo ${index + 1} diverge`);
  exactKeys(actual, ['step', 'ok', ...Object.keys(details)], `passo ${index + 1}`);
  for (const [key, value] of Object.entries(details)) {
    if (actual[key] !== value) fail(`detalhe ${key} do passo ${index + 1} diverge`);
  }
}

const manifest = {
  schema: 'maiocchi.sso-e2e-evidence-manifest.v1',
  generated_at: new Date().toISOString(),
  run_id: runtime.value.run_id,
  data_class: 'synthetic-only',
  public_exposure: false,
  signature_recipe: runtime.value.signature_recipe,
  signature_images: runtime.value.signature_images,
  lab_images: runtime.value.lab_images,
  uno_recipe: runtime.value.uno_recipe,
  uno_runtime: runtime.value.uno_runtime,
  tls_certificate_sha256: runtime.value.tls_certificate_sha256,
  trust_policy_sha256: runtime.value.trust_policy_sha256,
  source_bindings: runtime.value.source_bindings,
  allowed_uno_state_mutation: {
    ledger: 'lis.sso_authorization_codes',
    consumed_rows: 2,
    subject: protocol.value.subject,
    exchange_ids: exchangeIds,
    retention: 'immutable terminal rows; governed retention up to 30 days',
  },
  production_fingerprint_before: beforeFingerprint,
  production_fingerprint_after: afterFingerprint,
  production_scope: ['assinatura-portal', 'docuseal', 'docuseal-db', 'pades-provider', 'pki-bridge', 'pki-db'],
  artifacts: {
    runtime_envelope: { path: 'sso-e2e-runtime-envelope.json', sha256: runtime.sha256 },
    protocol_result: { path: 'probe-output/sso-e2e-result.json', sha256: protocol.sha256 },
    database_result: { path: 'probe-output/sso-e2e-db-result.txt', sha256: databaseResult.sha256 },
  },
};

const output = join(directory, 'sso-e2e-protocol-manifest.json');
let descriptor;
try {
  descriptor = openSync(output, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o400);
  writeFileSync(descriptor, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8' });
  fsyncSync(descriptor);
} finally {
  if (descriptor !== undefined) closeSync(descriptor);
}

process.stdout.write('Evidência de protocolo E2E: schema, bindings e produção invariável PASS\n');
