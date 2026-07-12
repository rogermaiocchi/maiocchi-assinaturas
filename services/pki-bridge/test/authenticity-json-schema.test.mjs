import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { buildAuthenticityRecord, signAuthenticityRecord } from "../src/authenticity-contract.mjs";

const schema = JSON.parse(await readFile(new URL("../../../public/schemas/authenticity-key-v1.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function envelope() {
  const { privateKey } = generateKeyPairSync("ed25519");
  const record = buildAuthenticityRecord({
    publicId: "MAI-2026-1111-1111-1111-1111",
    revision: 1,
    originalSha256: "a".repeat(64),
    originalSize: 2048,
    finalizedAt: "2026-07-12T12:00:00.000Z",
    profile: "AD-RT",
    policyOid: "2.16.76.1.7.1.12.2.3",
    signatureCount: 1,
    validatedAt: "2026-07-12T12:01:00.000Z",
    validator: "Validador de contrato",
    validatorKeyId: "validator-2026-01",
    validationAttestationSha256: "d".repeat(64),
    validationReportSha256: "b".repeat(64),
    validationReportSize: 512,
    representationSha256: "c".repeat(64),
    representationSize: 4096,
    disclosureMode: "restricted",
  });
  return signAuthenticityRecord(record, { privateKey, keyId: "authenticity-2026-01" });
}

test("envelope gerado satisfaz o JSON Schema Draft 2020-12 publicado", () => {
  const value = envelope();
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
});

test("schema rejeita propriedade adicional e URL original não HTTPS", () => {
  const additional = envelope();
  additional.record.unexpected = true;
  assert.equal(validate(additional), false);
  assert.ok(validate.errors.some((error) => error.keyword === "additionalProperties"));

  const unsafe = envelope();
  unsafe.record.links.original = "file:///tmp/document.pdf";
  assert.equal(validate(unsafe), false);
});
