import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const [
  baseArchive,
  patch,
  buildInputsPatch,
  nativeSecurityPatch,
  tiffSource,
  docusealVexTemplate,
  syftCandidateConfig,
  grypeCandidateConfig,
  docusealContract,
  access,
  traefik,
  overlay,
  buildScript,
  docusealPg16Harness,
  docusealPg16Dockerfile,
  candidatePreflight,
  candidateComposeRunner,
  patchIndexValidator,
  gatewayOverlay,
  gatewayConfig,
  docusealBootstrap,
  e2eProbe,
  pkiGenerator,
  secretProvisioner,
  runtimePreflight,
] = await Promise.all([
  readFile(new URL("../compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz", import.meta.url)),
  readFile(new URL("../patches/docuseal/0009-maiocchi-uno-sso.patch", import.meta.url), "utf8"),
  readFile(new URL("../patches/docuseal/0010-pin-build-inputs.patch", import.meta.url), "utf8"),
  readFile(new URL("../patches/docuseal/0011-update-native-image-libraries.patch", import.meta.url), "utf8"),
  readFile(new URL("../compliance/sources/tiff-4.7.2.tar.gz", import.meta.url)),
  readFile(new URL("../compliance/vex/docuseal-sso-tiff-4.7.2.openvex.template.json", import.meta.url), "utf8"),
  readFile(new URL("../compliance/config/syft-candidate.yaml", import.meta.url), "utf8"),
  readFile(new URL("../compliance/config/grype-candidate.yaml", import.meta.url), "utf8"),
  readFile(new URL("../compliance/releases/docuseal-sso-v3.0.1-maiocchi.15-candidate.contract.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../app/lawyer-access.tsx", import.meta.url), "utf8"),
  readFile(new URL("../deploy/traefik-assinatura.yml", import.meta.url), "utf8"),
  readFile(new URL("../deploy/docuseal-sso.candidate.yml", import.meta.url), "utf8"),
  readFile(new URL("../scripts/build-docuseal-sso-candidate.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/test-docuseal-sso-pg16-isolated.sh", import.meta.url), "utf8"),
  readFile(new URL("../tests/docuseal-sso-pg16/Dockerfile", import.meta.url), "utf8"),
  readFile(new URL("../scripts/validate-sso-candidate-images.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/run-sso-candidate-compose.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/validate-release-patch-indexes.sh", import.meta.url), "utf8"),
  readFile(new URL("../deploy/sso-e2e-gateway.candidate.yml", import.meta.url), "utf8"),
  readFile(new URL("../deploy/sso-e2e/gateway.conf", import.meta.url), "utf8"),
  readFile(new URL("../deploy/sso-e2e/docuseal-sso-bootstrap.rb", import.meta.url), "utf8"),
  readFile(new URL("../deploy/sso-e2e/sso-e2e-probe.rb", import.meta.url), "utf8"),
  readFile(new URL("../scripts/generate-sso-e2e-canary-pki.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/provision-docuseal-sso-canary-secret.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/validate-sso-e2e-runtime.sh", import.meta.url), "utf8"),
]);

const [portalPatch, portalBuild, portalOverlay, portalContract, portalPackage, portalLock, portalDockerfile, portalCompose, brand] = await Promise.all([
  readFile(new URL("../patches/portal/0001-maiocchi-sso-portal-1.15.1.patch", import.meta.url), "utf8"),
  readFile(new URL("../scripts/build-portal-sso-candidate.sh", import.meta.url), "utf8"),
  readFile(new URL("../deploy/portal-sso.candidate.yml", import.meta.url), "utf8"),
  readFile(new URL("../compliance/releases/portal-v1.15.1-sso-candidate.contract.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../package-lock.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  readFile(new URL("../compose.yml", import.meta.url), "utf8"),
  readFile(new URL("../app/brand.tsx", import.meta.url), "utf8"),
]);

test("patch SSO deriva exclusivamente da fonte DocuSeal .14 aprovada", () => {
  assert.equal(
    createHash("sha256").update(baseArchive).digest("hex"),
    "e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c",
  );
  assert.match(patch, /3[.]0[.]1-maiocchi[.]14[\s\S]*3[.]0[.]1-maiocchi[.]15/);
  assert.match(buildScript, /expected_base_sha='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'/);
  assert.equal(
    createHash("sha256").update(buildInputsPatch).digest("hex"),
    "0e36b9a594e3da75f64c3c37909be5fa9f57e3eefeeed2d21d993590496a5987",
  );
  assert.equal(
    createHash("sha256").update(nativeSecurityPatch).digest("hex"),
    "83250e4672db3a4256d7ec44f04f621ef7c1ee178718d9831948f9261580c30c",
  );
  assert.equal(
    createHash("sha256").update(tiffSource).digest("hex"),
    "672bd7d10aee4606171afb864f3570b83340f6a33e2c186dc0512f7145ffdf6a",
  );
  assert.equal(
    createHash("sha256").update(patch).digest("hex"),
    "2339df1880f6fc2af3706c51d29fc158a7c592a50c0deba5771b5a6eca51d54c",
  );
  assert.match(buildScript, /git -C "\$candidate_work" apply --check "\$sso_patch"/);
  assert.match(buildScript, /git -C "\$candidate_work" apply --check "\$build_inputs_patch"/);
  assert.match(buildScript, /git -C "\$candidate_work" apply --check "\$native_security_patch"/);
  const applySso = buildScript.indexOf('apply "$sso_patch"');
  const applyInputs = buildScript.indexOf('apply "$build_inputs_patch"');
  const applyNative = buildScript.indexOf('apply "$native_security_patch"');
  const installTiff = buildScript.indexOf('install -m 0644 "$tiff_source"');
  assert.ok(applySso >= 0 && applySso < applyInputs && applyInputs < applyNative && applyNative < installTiff);
  assert.match(patch, /20260718090100_install_maiocchi_sso_guards[.]rb/);
  assert.match(patch, /Rails carrega schema[.]rb em bancos vazios/);
  assert.match(patch, /CREATE OR REPLACE FUNCTION guard_maiocchi_sso_identity_binding/);
});

test("patch nativo deriva receita Alpine e instala TIFF/OpenEXR corrigidos por repositório assinado", () => {
  assert.equal(
    createHash("sha256").update(docusealVexTemplate).digest("hex"),
    "5b6f912098890a5c5126fa4e9eb410432f3749ec34f7b148b1b82b67108139e3",
  );
  assert.match(docusealVexTemplate, /"@id": "urn:uuid:__VEX_UUID__"/);
  assert.doesNotMatch(docusealVexTemplate, /435f85ca-5f9d-4953-bb06-66f7fa7dd2a7/);
  assert.match(nativeSecurityPatch, /Derived from Alpine aports commit 259914876552dabe6576835e874adc99129b58ae/);
  assert.match(nativeSecurityPatch, /pkgver=4[.]7[.]2/);
  assert.match(nativeSecurityPatch, /source="tiff-\$pkgver[.]tar[.]gz"/);
  assert.match(nativeSecurityPatch, /cmake3[.]5 -B build -G Ninja/);
  assert.match(nativeSecurityPatch, /bad66954a7e7e158c6dcbfc0e2d0032b8f3e2a354b6d0fdbb8038a7963e36c5b8a433dd4ee81c6c4dabfb50094152d440aa1f32b5299098c9ae29e55de2e41fc/);
  assert.match(nativeSecurityPatch, /su package-builder -c [^\n]*abuild -r/);
  assert.match(nativeSecurityPatch, /abuild-sign -k/);
  assert.match(nativeSecurityPatch, /--repository \/usr\/share\/maiocchi\/tiff-repository/);
  assert.doesNotMatch(nativeSecurityPatch, /--allow-untrusted/);
  assert.equal((nativeSecurityPatch.match(/'openexr-lib[^']+=3[.]4[.]13-r0'/g) || []).length, 8);
  assert.equal((nativeSecurityPatch.match(/'tiff=4[.]7[.]2-r0'/g) || []).length, 2);
  assert.deepEqual(docusealContract.patch_chain.map(({ sequence }) => sequence), [9, 10, 11]);
  assert.equal(docusealContract.patch_chain[2].sha256, createHash("sha256").update(nativeSecurityPatch).digest("hex"));
  assert.equal(docusealContract.native_libraries.tiff.source_sha256, createHash("sha256").update(tiffSource).digest("hex"));
  assert.equal(docusealContract.native_libraries.tiff.version, "4.7.2-r0");
  assert.equal(docusealContract.native_libraries.tiff.source_url, "https://download.osgeo.org/libtiff/tiff-4.7.2.tar.gz");
  assert.equal(docusealContract.native_libraries.openexr.version, "3.4.13-r0");
  assert.equal(docusealContract.schema, "maiocchi.docuseal-sso-candidate-contract.v1");
  assert.equal(docusealContract.openvex.template_sha256, createHash("sha256").update(docusealVexTemplate).digest("hex"));
  assert.match(docusealContract.openvex.document_identity, /new urn:uuid per evidence build/);
  assert.deepEqual(docusealContract.vulnerability_policy.allowed_vex.map(({ id, status }) => [id, status]), [
    ["CVE-2023-52356", "not_affected"],
    ["CVE-2026-4775", "fixed"],
  ]);
  assert.match(docusealContract.vulnerability_policy.allowed_vex[0].reference, /nvd[.]nist[.]gov\/vuln\/detail\/CVE-2023-52356/);
  assert.match(docusealContract.vulnerability_policy.allowed_vex[1].references[1], /782a11d6b5b61c6dc21e714950a4af5bf89f023c/);
  assert.equal(docusealContract.vulnerability_policy.openexr_vex_allowed, false);
});

test("scanners candidatos usam configuração versionada, binários exatos e DB congelado", () => {
  const syftConfigSha = createHash("sha256").update(syftCandidateConfig).digest("hex");
  const grypeConfigSha = createHash("sha256").update(grypeCandidateConfig).digest("hex");
  assert.equal(syftConfigSha, "8d154f9e73d36bc74ae76d45b76020ec3ad591e81325f0a626ec2d9f67d0b893");
  assert.equal(grypeConfigSha, "50b1ced07b248a9044339b243c85957608de3ed8869f296ec8ed58ef21b11d8d");
  assert.equal(docusealContract.scanner_policy.syft.config_sha256, syftConfigSha);
  assert.equal(docusealContract.scanner_policy.grype.config_sha256, grypeConfigSha);
  assert.equal(docusealContract.scanner_policy.syft.version, "1.46.0");
  assert.equal(docusealContract.scanner_policy.syft.git_commit, "b15c5dbfe2bb21c9d73002c1056a829c8c411c75");
  assert.equal(docusealContract.scanner_policy.syft.binary_sha256, "574df1a0862ff88ad933be214e81069e35b17618a13e019f8f1c84fe063222a2");
  assert.equal(docusealContract.scanner_policy.syft.release_archive.sha256, "d654f678b709eb53c393d38519d5ed7d2e57205529404018614cfefa0fb2b5ca");
  assert.equal(docusealContract.scanner_policy.grype.version, "0.115.0");
  assert.equal(docusealContract.scanner_policy.grype.git_commit, "fa8b7e2a528cf1f8b098123f256c61db9e5df69c");
  assert.equal(docusealContract.scanner_policy.grype.binary_sha256, "05ffd2c28a607e48fb2269d9aac5b3d53e8a51bbac501946644745eae2119907");
  assert.equal(docusealContract.scanner_policy.grype.release_archive.sha256, "3fad92940650e514c0aa2dad83526942a055e210cec09a8a59d9c024adc2b90e");
  assert.equal(docusealContract.scanner_policy.grype.database_max_age_seconds, 86400);
  assert.deepEqual(portalContract.scanner_policy.syft, docusealContract.scanner_policy.syft);
  assert.deepEqual(portalContract.scanner_policy.grype, {
    ...docusealContract.scanner_policy.grype,
    database_freeze: "status and file SHA-256 must remain identical across raw scan and severity gate",
  });
  assert.match(syftCandidateConfig, /^check-for-app-update: false$/m);
  assert.match(syftCandidateConfig, /^from: docker$/m);
  assert.match(grypeCandidateConfig, /^ignore: \[\]$/m);
  assert.match(grypeCandidateConfig, /^vex-documents: \[\]$/m);
  assert.match(grypeCandidateConfig, /^  auto-update: false$/m);
  assert.match(grypeCandidateConfig, /^  validate-by-hash-on-start: true$/m);
  assert.match(grypeCandidateConfig, /^  max-allowed-built-age: 24h0m0s$/m);
  for (const scannerBuilder of [buildScript, portalBuild]) {
    assert.match(scannerBuilder, /syft_bin=\$\(command -v syft\)/);
    assert.match(scannerBuilder, /grype_bin=\$\(command -v grype\)/);
    assert.match(scannerBuilder, /"\$syft_bin" --config "\$syft_config"/);
    assert.match(scannerBuilder, /"\$grype_bin" --config "\$grype_config"/);
    assert.equal((scannerBuilder.match(/verify_scanner_binary "\$syft_bin"/g) || []).length, 2);
    assert.equal((scannerBuilder.match(/verify_scanner_binary "\$grype_bin"/g) || []).length, 2);
  }
  assert.equal(docusealContract.recipe_implementation.builder.sha256, createHash("sha256").update(buildScript).digest("hex"));
  assert.equal(docusealContract.recipe_implementation.postgres_harness.sha256, createHash("sha256").update(docusealPg16Harness).digest("hex"));
  assert.equal(docusealContract.recipe_implementation.postgres_harness.dockerfile_sha256, createHash("sha256").update(docusealPg16Dockerfile).digest("hex"));
  assert.equal(docusealContract.recipe_implementation.candidate_preflight.sha256, createHash("sha256").update(candidatePreflight).digest("hex"));
  assert.equal(docusealContract.recipe_implementation.patch_index_audit.sha256, createHash("sha256").update(patchIndexValidator).digest("hex"));
  assert.equal(docusealContract.recipe_implementation.compose_runner.sha256, createHash("sha256").update(candidateComposeRunner).digest("hex"));
  assert.equal(docusealContract.recipe_implementation.candidate_compose.sha256, createHash("sha256").update(overlay).digest("hex"));
  assert.equal(portalContract.recipe_implementation.candidate_compose.sha256, createHash("sha256").update(portalOverlay).digest("hex"));
  assert.deepEqual(Object.keys(docusealContract.endpoint_profiles).sort(), ["canary", "production", "selection"]);
  assert.equal(docusealContract.endpoint_profiles.canary.issuer, "https://uno-canary.maiocchi.adv.br");
  assert.equal(
    docusealContract.endpoint_profiles.canary.redirect_uri,
    "https://assinatura-canary.maiocchi.adv.br/sso/maiocchi/callback",
  );
});

test("browser flow fixa endpoints, PKCE S256, state use-once e sessão host-only", () => {
  assert.match(patch, /ENDPOINT_PROFILES = \{/);
  assert.match(patch, /'production' => \{[\s\S]*issuer: 'https:\/\/www[.]maiocchi[.]adv[.]br'/);
  assert.match(patch, /'canary' => \{[\s\S]*issuer: 'https:\/\/uno-canary[.]maiocchi[.]adv[.]br'/);
  assert.match(patch, /ENV[.]fetch\('MAIOCCHI_SSO_PROFILE', 'production'\)/);
  assert.match(patch, /Configuration[.]authorize_url/);
  assert.match(patch, /Configuration[.]token_url/);
  assert.match(patch, /Configuration[.]redirect_uri/);
  assert.doesNotMatch(patch, /ENV\['MAIOCCHI_SSO_(?:ISSUER|AUTHORIZE_URL|TOKEN_URL|REDIRECT_URI)'\]/);
  assert.match(patch, /get 'sso\/maiocchi\/start'/);
  assert.match(patch, /get 'sso\/maiocchi\/callback'/);
  assert.match(patch, /SecureRandom[.]urlsafe_base64/);
  assert.match(patch, /Digest::SHA256[.]hexdigest\(state\)/);
  assert.match(patch, /Base64[.]urlsafe_encode64\(Digest::SHA256[.]digest\(verifier\), padding: false\)/);
  assert.match(patch, /flow = session[.]delete\(:maiocchi_sso\)/);
  assert.match(patch, /reset_session[\s\S]*sign_in\(:user, user\)/);
  assert.match(patch, /'__Host-docuseal_session'/);
  assert.match(patch, /same_site: :lax/);
  assert.match(patch, /config[.]rememberable_options = \{/);
  assert.match(patch, /response[.]headers\['Cache-Control'\] = 'no-store'/);
  assert.match(patch, /split\(','\)[.]map\(&:strip\)\)[.]to include\('no-store'\)/);
  const privateHeaders = patch.indexOf("+  before_action :set_private_response_headers");
  const hostGuard = patch.indexOf("+  before_action :ensure_exact_callback_host!");
  const enabledGuard = patch.indexOf("+  before_action :ensure_enabled!");
  assert.ok(privateHeaders >= 0 && privateHeaders < hostGuard && hostGuard < enabledGuard);
  assert.doesNotMatch(patch, /^\+\s*after_action :set_private_response_headers/m);
  assert.doesNotMatch(patch, /domain:/);
});

test("respostas de erro do SSO preservam os três headers privados", () => {
  const addedPatch = patch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
  const wrongState = addedPatch.match(
    /it 'rejects a wrong state without calling the backchannel' do([\s\S]*?)(?=\n\s*it '|\nend\s*$)/,
  )?.[1];
  const nonCanonicalHost = addedPatch.match(
    /it 'rejects extra callback parameters and a non-canonical host' do([\s\S]*?)(?=\n\s*it '|\nend\s*$)/,
  )?.[1];

  for (const example of [wrongState, nonCanonicalHost]) {
    assert.ok(example, "o exemplo de erro deve existir no request spec aplicado");
    assert.match(example, /have_http_status\(:unprocessable_content\)/);
    assert.match(example, /headers\['Cache-Control'\][.]split\(','\)[.]map\(&:strip\)\)[.]to include\('no-store'\)/);
    assert.match(example, /headers\['Pragma'\]\)[.]to eq\('no-cache'\)/);
    assert.match(example, /headers\['Referrer-Policy'\]\)[.]to eq\('no-referrer'\)/);
  }
});

test("hunk do request spec DocuSeal declara todas as 116 linhas e o blob integral", () => {
  const requestSpecDiff = patch.match(
    /diff --git a\/spec\/requests\/maiocchi_sso_spec[.]rb b\/spec\/requests\/maiocchi_sso_spec[.]rb([\s\S]*)$/,
  )?.[1];
  assert.ok(requestSpecDiff, "o patch deve conter o request spec SSO completo");
  assert.match(
    requestSpecDiff,
    /index 0000000000000000000000000000000000000000[.][.]e4d951553a3f5563cda891201a7ec268e5a6b785/,
  );
  assert.match(requestSpecDiff, /@@ -0,0 \+1,116 @@/);
  const addedRequestSpecLines = requestSpecDiff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));
  assert.equal(addedRequestSpecLines.length, 116);
});

test("todo diff dos patches DocuSeal declara metadado de blob completo", () => {
  assert.match(
    patch,
    /diff --git a\/db\/migrate\/20260718090100_install_maiocchi_sso_guards[.]rb b\/db\/migrate\/20260718090100_install_maiocchi_sso_guards[.]rb\nnew file mode 100644\nindex 0000000000000000000000000000000000000000[.][.]3d5b35e1055c6369927594852c5c50c3f6fea81b/,
  );
  assert.match(
    buildInputsPatch,
    /diff --git a\/Dockerfile b\/Dockerfile\nindex ddb378156cc1a1ac5c6fb9342248e64e4dac47aa[.][.]f4a9ac9f19057f3059a903734f62a725edd4dc47 100644/,
  );
  for (const [candidatePatch, expectedDiffs] of [
    [patch, 21],
    [buildInputsPatch, 1],
    [nativeSecurityPatch, 2],
  ]) {
    const diffCount = (candidatePatch.match(/^diff --git /gm) || []).length;
    const indexCount = (candidatePatch.match(/^index [0-9a-f]+[.][.][0-9a-f]+(?: [0-9]+)?$/gm) || []).length;
    assert.equal(diffCount, expectedDiffs);
    assert.equal(indexCount, diffCount);
  }
});

test("backchannel exige contrato absoluto, Basic distinto e resposta allowlisted", () => {
  for (const field of ["issued_at", "expires_at", "issuer", "audience", "scope", "nonce", "subject", "role", "exchange_id"]) {
    assert.match(patch, new RegExp(`\\b${field}\\b`));
  }
  assert.match(patch, /request[.]basic_auth\(MaiocchiSso::Configuration::CLIENT_ID/);
  assert.match(patch, /claims[.]keys[.]sort == REQUIRED_KEYS[.]sort/);
  assert.match(patch, /absolute_ttl == ttl/);
  assert.match(patch, /remaining[.]positive[?]/);
  assert.match(patch, /OpenSSL::SSL::VERIFY_PEER/);
  assert.match(patch, /MAX_RESPONSE_BYTES = 32[.]kilobytes/);
  assert.match(patch, /response[.]read_body do \|chunk\|/);
  assert.match(patch, /auth_time > issued_at/);
});

test("binding durável impede replay, takeover por e-mail, account drift e role drift", () => {
  assert.match(patch, /idx_maiocchi_sso_provider_subject/);
  assert.match(patch, /idx_maiocchi_sso_provider_exchange/);
  assert.match(patch, /trg_maiocchi_sso_identity_binding/);
  assert.match(patch, /trg_maiocchi_sso_exchange_append_only/);
  assert.match(patch, /User[.]where\('LOWER\(email\) = [?]'/);
  assert.match(patch, /identity[.]email_at_link[.]casecmp[?]\(normalized_email\)/);
  assert.match(patch, /identity[.]account_id == account[.]id && user[.]account_id == account[.]id/);
  assert.match(patch, /ALLOWED_EXTERNAL_ROLES = %w\[admin advogado staff\]/);
  assert.match(patch, /dependent: :restrict_with_exception/);
});

test("portal e roteamento tornam o SSO primário sem remover os fallbacks", () => {
  assert.match(access, /Entrar com Portal Maiocchi/);
  assert.match(access, /window[.]location[.]assign\("\/sso\/maiocchi\/start"\)/);
  assert.match(access, /Entrar com certificado/);
  assert.match(access, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(traefik, /sign_out\|sso\|start_form_email_2fa_send/);
  assert.match(overlay, /image: "\$\{DOCUSEAL_SSO_CANDIDATE_IMAGE_ID:[?]defina o image ID sha256 validado pelo preflight\}"/);
  assert.doesNotMatch(overlay, /\$\{DOCUSEAL_SSO_CANDIDATE_IMAGE:[?:]/);
  assert.match(overlay, /MAIOCCHI_SSO_CLIENT_SECRET_FILE: \/run\/signature-canary-secrets\/api_signature_sso_client_secret/);
  assert.doesNotMatch(overlay, /MAIOCCHI_SSO_CLIENT_SECRET:\s/);
});

test("canário DocuSeal não herda nomes, banco, volumes ou rede de produção", () => {
  assert.match(overlay, /^\s{2}docuseal-sso-candidate:/m);
  assert.match(overlay, /^\s{2}docuseal-sso-db-candidate:/m);
  assert.match(overlay, /^\s{2}docuseal-sso-bootstrap-candidate:/m);
  assert.match(overlay, /^\s{2}sso-e2e-probe-candidate:/m);
  assert.doesNotMatch(overlay, /^\s{2}docuseal:/m);
  assert.doesNotMatch(overlay, /^\s{2}docuseal-db:/m);
  assert.doesNotMatch(overlay, /container_name:|^\s+name:\s+docuseal-sso-candidate/m);
  assert.match(overlay, /postgres:16-alpine@sha256:[0-9a-f]{64}/);
  assert.match(overlay, /DOCUSEAL_CANARY_SECRET_DIR:[?]/);
  assert.match(overlay, /MAIOCCHI_SSO_PROFILE: canary/);
  assert.equal((overlay.match(/- signature-sso-candidate/g) || []).length, 2);
  assert.match(overlay, /condition: service_completed_successfully/);
  assert.match(overlay, /MAIOCCHI_CANARY_ACCOUNT_UUID: "33333333-3333-4333-8333-333333333333"/);
  assert.match(overlay, /APP_URL: https:\/\/assinatura-canary[.]maiocchi[.]adv[.]br/);
  assert.match(overlay, /SSL_CERT_FILE: \/run\/sso-e2e-pki\/ca[.]crt/);
  assert.match(overlay, /group_add:[\s\S]*DOCUSEAL_CANARY_SECRET_GID:-3400/);
  assert.match(overlay, /mem_limit: 1536m/);
  assert.match(overlay, /pids_limit: 384/);
  assert.match(overlay, /max-size: 10m/);
  assert.match(overlay, /internal: true/);
  assert.doesNotMatch(overlay, /ports:|traefik-net|signature-internal|DOCUSEAL_DATA_DIR|DOCUSEAL_PGDATA_DIR/);
});

test("gateway TLS privado une somente os dois runtimes canário", () => {
  assert.match(gatewayOverlay, /nginxinc\/nginx-unprivileged:1[.]30[.]3-alpine3[.]23-slim@sha256:[0-9a-f]{64}/);
  assert.match(gatewayOverlay, /user: "0:0"/);
  assert.match(gatewayOverlay, /cap_drop:[\s\S]*- ALL[\s\S]*cap_add:[\s\S]*- NET_BIND_SERVICE/);
  assert.match(gatewayOverlay, /uno-canary[.]maiocchi[.]adv[.]br/);
  assert.match(gatewayOverlay, /assinatura-canary[.]maiocchi[.]adv[.]br/);
  assert.match(gatewayOverlay, /UNO_SSO_CANDIDATE_NETWORK:[?]/);
  assert.match(gatewayOverlay, /external: true/);
  assert.doesNotMatch(gatewayOverlay, /ports:|traefik[.]http|docker[.]sock/);
  assert.match(gatewayConfig, /listen 443 ssl default_server/);
  assert.match(gatewayConfig, /location \/ \{ return 444; \}/);
  assert.match(gatewayConfig, /proxy_pass http:\/\/uno_canary_portal/);
  assert.match(gatewayConfig, /proxy_pass http:\/\/signature_canary_docuseal/);
  assert.match(gatewayConfig, /proxy_pass http:\/\/signature_canary_portal/);
  assert.match(gatewayConfig, /X-Forwarded-Proto https/);
});

test("laboratório prova login, PKCE, vínculo persistente e dois anti-replays sem expor secrets", () => {
  assert.match(docusealBootstrap, /candidate account drift detected/);
  assert.match(docusealBootstrap, /Account[.]active[.]where\(uuid: expected_uuid\)[.]count == 1/);
  assert.match(e2eProbe, /Entrar com Portal Maiocchi/);
  assert.match(e2eProbe, /docuseal_pkce_start/);
  assert.match(e2eProbe, /uno_synthetic_staff_login/);
  assert.match(e2eProbe, /docuseal_code_exchange/);
  assert.match(e2eProbe, /docuseal_callback_replay_rejected/);
  assert.match(e2eProbe, /uno_token_replay_rejected/);
  assert.match(e2eProbe, /MaiocchiSsoIdentity[.]find_by!/);
  assert.match(e2eProbe, /maiocchi_sso_exchanges[.]count == 1/);
  assert.match(e2eProbe, /private-ca-verify-peer/);
  assert.match(e2eProbe, /File::CREAT \| File::EXCL/);
  assert.doesNotMatch(e2eProbe, /puts.*password|puts.*client_secret|p\s+password|p\s+client_secret/);
});

test("PKI, cópia de secret e runtime são fail-closed e efêmeros", () => {
  assert.match(pkiGenerator, /O diretório de PKI deve ser absoluto/);
  assert.match(pkiGenerator, /DNS[.]1 = uno-canary[.]maiocchi[.]adv[.]br/);
  assert.match(pkiGenerator, /DNS[.]2 = assinatura-canary[.]maiocchi[.]adv[.]br/);
  assert.match(pkiGenerator, /extendedKeyUsage = critical,serverAuth/);
  assert.match(pkiGenerator, /install -m 0400 "\$tmp_dir\/server[.]key"/);
  assert.match(secretProvisioner, /install -o 0 -g "\$target_gid" -m 0440/);
  assert.match(secretProvisioner, /cmp -s "\$source_file"/);
  assert.match(runtimePreflight, /MAIOCCHI_CANARY_SSO_ENABLED deve ser exatamente true/);
  assert.match(runtimePreflight, /UNO e DocuSeal|cópias governadas/);
  assert.match(runtimePreflight, /openssl verify -CAfile/);
  assert.match(runtimePreflight, /Certificado e chave TLS E2E não correspondem/);
  assert.match(runtimePreflight, /maiocchi-uno-canary-\(blue\|green\)_canary-internal/);
  assert.match(runtimePreflight, /true\|canary-internal\|maiocchi-uno-canary-\$slot/);
});

test("harness PG16 entrega tmpfs gravável somente ao usuário não-root da aplicação", () => {
  assert.match(docusealPg16Harness, /uid=2100,gid=2100,mode=0700/);
  assert.equal((docusealPg16Harness.match(/uid=2100,gid=2100,mode=0700/g) || []).length, 3);
  assert.match(docusealPg16Harness, /--tmpfs '\/app\/tmp:[^']*uid=2100,gid=2100,mode=0700'/);
  assert.doesNotMatch(docusealPg16Harness, /--tmpfs '\/app\/(?:log|storage|tmp):[^']*mode=0?777/);
});

test("harness valida o round-trip TIFF pela mesma API Ruby/Vips da aplicação", () => {
  assert.match(docusealPg16Harness, /bundle exec ruby -rvips -e/);
  assert.match(docusealPg16Harness, /Vips::Image[.]black\(2, 2\)/);
  assert.match(docusealPg16Harness, /image[.]tiffsave/);
  assert.match(docusealPg16Harness, /Vips::Image[.]new_from_file/);
  assert.doesNotMatch(docusealPg16Harness, /\bvips black\b|\bvipsheader\b/);
});

test("harness PG16 carrega PDFium pelo mesmo release e hash do candidato", () => {
  assert.doesNotMatch(docusealPg16Dockerfile, /^#\s*syntax=/m);
  assert.match(docusealPg16Dockerfile, /releases\/download\/chromium\/7947\/pdfium-linux-musl-x64[.]tgz/);
  assert.match(docusealPg16Dockerfile, /4fd8d95a629dfd5009f81ddb32b54b96e113d6fdc1c4801aae5e2fb37911c91b/);
  assert.match(docusealPg16Dockerfile, /COPY --from=docuseal-sso-pdfium \/pdfium-linux\/lib\/libpdfium[.]so \/usr\/lib\/libpdfium[.]so/);
  assert.doesNotMatch(docusealPg16Dockerfile, /releases\/latest|refs\/heads\/(?:main|master)/);
});

test("harness valida sintaxe Ruby do conjunto fechado de quatro specs antes do build", () => {
  const specsDeclaration = docusealPg16Harness.match(/readonly -a sso_specs=\(([\s\S]*?)\n\)/)?.[1];
  assert.ok(specsDeclaration, "o harness deve declarar o conjunto fechado de specs SSO");
  const expectedSpecs = [
    "spec/lib/maiocchi_sso_configuration_spec.rb",
    "spec/lib/maiocchi_sso_identity_resolver_spec.rb",
    "spec/lib/maiocchi_sso_token_exchange_spec.rb",
    "spec/requests/maiocchi_sso_spec.rb",
  ];
  const declaredSpecs = [...specsDeclaration.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(declaredSpecs, expectedSpecs);
  assert.match(docusealPg16Harness, /readonly syntax_container="maiocchi-docuseal-sso-pg16-syntax-\$run_id"/);
  assert.match(docusealPg16Harness, /"\$syntax_container"[\s\S]*docker container rm --force --volumes/);
  assert.match(docusealPg16Harness, /docker pull --platform linux\/amd64 "\$ruby_image"/);
  assert.match(docusealPg16Harness, /--name "\$syntax_container"[\s\S]*--network none[\s\S]*--read-only/);
  assert.match(docusealPg16Harness, /host_uid="\$\(id -u\)"/);
  assert.match(docusealPg16Harness, /host_gid="\$\(id -g\)"/);
  assert.match(docusealPg16Harness, /"\$host_uid" =~ \^\[1-9\]\[0-9\]\*\$/);
  assert.match(docusealPg16Harness, /"\$host_gid" =~ \^\[1-9\]\[0-9\]\*\$/);
  assert.match(docusealPg16Harness, /--user "\$host_uid:\$host_gid"/);
  assert.doesNotMatch(docusealPg16Harness, /--user '65534:65534'/);
  assert.match(docusealPg16Harness, /--volume "\$candidate_source:\/source:ro"/);
  assert.match(docusealPg16Harness, /ruby -c "\$ruby_file"[\s\S]*"\$\{sso_specs\[@\]\}"/);
  const syntaxRun = docusealPg16Harness.indexOf('docker run --rm \\\n  --name "$syntax_container"');
  const imageBuild = docusealPg16Harness.indexOf("docker build \\");
  assert.ok(syntaxRun >= 0 && syntaxRun < imageBuild);
});

test("harness vincula o ensaio ao commit assinado e à árvore rastreada limpa", () => {
  assert.match(docusealPg16Harness, /git -C "\$repo_dir" verify-commit "\$observed_commit"/);
  assert.match(docusealPg16Harness, /git -C "\$repo_dir" diff --quiet --no-ext-diff --/);
  assert.match(docusealPg16Harness, /git -C "\$repo_dir" diff --cached --quiet --no-ext-diff --/);
  assert.match(docusealPg16Harness, /--label "\$recipe_commit_label=\$recipe_commit"/);
  assert.match(docusealPg16Harness, /br[.]adv[.]maiocchi[.]recipe-commit/);
  const firstRecipeGate = docusealPg16Harness.indexOf("verify_recipe_git_state\n");
  const firstDockerCheck = docusealPg16Harness.indexOf("command -v docker");
  const buildRecipeGate = docusealPg16Harness.lastIndexOf("verify_recipe_git_state\n");
  const dockerBuild = docusealPg16Harness.indexOf("docker build \\");
  assert.ok(firstRecipeGate >= 0 && firstRecipeGate < firstDockerCheck);
  assert.ok(buildRecipeGate > firstRecipeGate && buildRecipeGate < dockerBuild);
});

test("portal estático possui candidato 1.15.1 derivado de snapshot imutável", () => {
  const patchSha = createHash("sha256").update(portalPatch).digest("hex");
  const buildScriptSha = createHash("sha256").update(portalBuild).digest("hex");
  assert.equal(patchSha, "d088a5a8fdcde66e12ab747dad9a4477de39513f168dbb61bad264a92e19be66");
  assert.equal(portalContract.source_patch.sha256, patchSha);
  assert.equal(portalContract.build_script.sha256, buildScriptSha);
  assert.equal(portalContract.base_commit, "7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d");
  assert.equal(portalContract.image, "maiocchi/assinatura-portal:1.15.1-sso-<recipe-sha12>-a<attempt-2d>");
  assert.equal(portalPackage.version, "1.15.1");
  assert.equal(portalLock.version, "1.15.1");
  assert.equal(portalLock.packages[""].version, "1.15.1");
  assert.match(portalDockerfile, /org[.]opencontainers[.]image[.]version="1[.]15[.]1"/);
  assert.match(portalDockerfile, /org[.]opencontainers[.]image[.]source="https:\/\/github[.]com\/rogermaiocchi\/maiocchi-assinaturas"/);
  assert.doesNotMatch(portalDockerfile, /tree\/portal-v1[.]15[.]1/);
  assert.match(portalCompose, /image: maiocchi\/assinatura-portal:1[.]15[.]1/);
  assert.match(brand, /import Image from "next\/image"/);
  assert.equal((brand.match(/<Image /g) || []).length, 2);
  assert.doesNotMatch(brand, /<img\b/);
  assert.doesNotMatch(portalPatch, /globals 2[.]css|README 2[.]md|SHA256SUMS 2/);
});

test("build do portal exclui worktree suja e exige SBOM e scan antes de promoção", () => {
  assert.match(portalBuild, /git -C "\$repo_dir" archive --format=tar/);
  assert.match(portalBuild, /git -C "\$repo_dir" diff --quiet HEAD --/);
  assert.match(portalBuild, /git -C "\$repo_dir" diff --cached --quiet/);
  assert.match(portalBuild, /git -C "\$repo_dir" verify-commit "\$recipe_commit"/);
  assert.match(portalBuild, /git -C "\$source_dir" apply --check "\$portal_patch"/);
  assert.match(portalBuild, /npm run build[\s\S]*node --test tests\/\*[.]test[.]mjs[\s\S]*npm run lint/);
  assert.match(portalBuild, /candidate_image_id=\$\(docker image inspect --format '\{\{[.]Id\}\}' "\$candidate_image"\)/);
  assert.match(portalBuild, /docker image inspect "\$candidate_image_id" >"\$evidence_dir\/portal-\$candidate_version[.]image-inspect[.]json"/);
  assert.match(portalBuild, /docker image save --output "\$evidence_dir\/portal-\$candidate_version[.]docker-image[.]tar" "\$candidate_image_id"/);
  assert.match(portalBuild, /run_syft "\$candidate_image_id" >"\$evidence_dir\/portal-\$candidate_version[.]cdx[.]json"/);
  assert.match(portalBuild, /run_grype "\$candidate_image_id" >"\$evidence_dir\/portal-\$candidate_version[.]grype[.]json"/);
  assert.match(portalBuild, /run_grype "\$candidate_image_id" --fail-on high >\/dev\/null/);
  assert.match(portalBuild, /env -i HOME="\$scanner_home" PATH="\$scanner_path"/);
  assert.match(portalBuild, /run_grype db update/);
  assert.match(portalBuild, /grype_db_sha_before=\$\(shasum -a 256 "\$grype_db_path"/);
  assert.match(portalBuild, /Banco do Grype mudou durante o scan raw e o gate de severidade/);
  assert.match(portalBuild, /portal-\$candidate_version[.]scan-metadata[.]json/);
  assert.doesNotMatch(portalBuild, /(?:run_syft|run_grype) "\$candidate_image"/);
  assert.match(portalBuild, /printf '%s\\n' "\$candidate_image_id" >"\$evidence_dir\/portal-\$candidate_version[.]image-id[.]txt"/);
  assert.match(portalBuild, /"portal-\$candidate_version[.]image-id[.]txt"/);
  for (const label of [
    "org.opencontainers.image.version",
    "org.opencontainers.image.revision",
    "br.adv.maiocchi.base-commit",
    "br.adv.maiocchi.patch-sha256",
    "br.adv.maiocchi.recipe-commit",
  ]) {
    assert.match(
      portalBuild,
      new RegExp(`docker image inspect --format '[^\\n]*${label.replaceAll(".", "[.]")}[^\\n]*' "\\$candidate_image_id"`),
    );
  }
  const explicitNode = portalBuild.indexOf('source_node_bin="${PORTAL_SSO_NODE_BIN:-}"');
  const unconditionalNodeValidation = portalBuild.indexOf('"$source_node_bin" -e');
  const verifyOnly = portalBuild.indexOf('if [ "${PORTAL_SSO_VERIFY_ONLY:-false}" = \'true\' ]');
  assert.ok(explicitNode >= 0 && explicitNode < unconditionalNodeValidation);
  assert.ok(unconditionalNodeValidation >= 0 && unconditionalNodeValidation < verifyOnly);
  assert.doesNotMatch(portalBuild, /\nnode -e '/);
  assert.match(portalBuild, /major === 22 && minor >= 13/);
  assert.match(portalBuild, /Node[.]js 22[.]13 ou superior, dentro da major 22, é obrigatório/);
  assert.match(portalBuild, /PORTAL_SSO_CANDIDATE_IMAGE é obrigatório/);
  assert.match(portalBuild, /1\[.\]15\[.\]1-sso-\$\{recipe_short\}-a\[0-9\]\[0-9\]/);
  assert.match(portalBuild, /PORTAL_SSO_EVIDENCE_DIR absoluto é obrigatório/);
  assert.match(portalBuild, /Tag candidata já existe; sobrescrita recusada/);
  assert.match(portalBuild, /Diretório de evidência já existe; sobrescrita recusada/);
  assert.match(portalBuild, /git -C "\$repo_dir" rev-parse --git-path ['"]?maiocchi-release-tag-locks['"]?/);
  assert.match(portalBuild, /if ! mkdir "\$tag_lock_root\/\$tag_lock_key"; then/);
  assert.match(portalBuild, /if ! mkdir "\$evidence_dir"; then/);
  assert.doesNotMatch(portalBuild, /mkdir -p "\$evidence_dir"/);
  assert.match(portalBuild, /docker build \\\n\s*--pull \\\n\s*--platform linux\/amd64/);
  assert.equal(portalContract.status, "no-go-evidence-pending");
  assert.equal(portalContract.scanner_policy.syft.config_sha256, createHash("sha256").update(syftCandidateConfig).digest("hex"));
  assert.equal(portalContract.scanner_policy.grype.config_sha256, createHash("sha256").update(grypeCandidateConfig).digest("hex"));
  assert.equal(portalContract.recipe_implementation.builder.sha256, createHash("sha256").update(portalBuild).digest("hex"));
  assert.equal(portalContract.recipe_implementation.candidate_preflight.sha256, createHash("sha256").update(candidatePreflight).digest("hex"));
  assert.equal(portalContract.recipe_implementation.patch_index_audit.sha256, createHash("sha256").update(patchIndexValidator).digest("hex"));
  assert.equal(portalContract.recipe_implementation.compose_runner.sha256, createHash("sha256").update(candidateComposeRunner).digest("hex"));
  assert.deepEqual(portalContract.required_evidence.map(({ kind }) => kind), [
    "immutable-image-id", "image-inspect", "image-archive", "sbom", "vulnerability-report", "scanner-metadata", "artifact-manifest",
  ]);
  for (const line of portalDockerfile.match(/^FROM .+$/gm) || []) {
    assert.match(line, /@sha256:[0-9a-f]{64}/);
  }
});

test("build DocuSeal fixa bases, bibliotecas nativas e evidência antes de promoção", () => {
  const addedBuildInputLines = buildInputsPatch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  assert.match(buildScript, /ruby_base_digest='sha256:[0-9a-f]{64}'/);
  assert.match(buildScript, /git -C "\$repo_dir" diff --quiet HEAD --/);
  assert.match(buildScript, /git -C "\$repo_dir" diff --cached --quiet/);
  assert.match(buildScript, /git -C "\$repo_dir" verify-commit "\$recipe_commit"/);
  assert.match(buildScript, /RUBY_VERSION'\)" = '4[.]0[.]5'/);
  const rubySyntaxLoop = buildScript.match(/for ruby_file in \\([\s\S]*?)\ndo\n\s+"\$ruby_bin" -c "\$ruby_file"/)?.[1];
  assert.ok(rubySyntaxLoop, "o build deve executar Ruby -c sobre a lista declarada");
  for (const specPath of [
    "spec/lib/maiocchi_sso_configuration_spec.rb",
    "spec/lib/maiocchi_sso_identity_resolver_spec.rb",
    "spec/lib/maiocchi_sso_token_exchange_spec.rb",
    "spec/requests/maiocchi_sso_spec.rb",
  ]) {
    assert.match(rubySyntaxLoop, new RegExp(specPath.replaceAll(".", "[.]")));
  }
  assert.match(buildScript, /FROM \$\{ruby_base\}@\$\{ruby_base_digest\}/);
  assert.match(buildScript, /candidate_image_id=\$\(docker image inspect --format '\{\{[.]Id\}\}' "\$candidate_image"\)/);
  assert.match(buildScript, /docker image inspect "\$candidate_image_id" >"\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]image-inspect[.]json"/);
  assert.match(buildScript, /docker image save --output "\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]docker-image[.]tar" "\$candidate_image_id"/);
  assert.match(buildScript, /run_syft "\$candidate_image_id" >"\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]cdx[.]json"/);
  assert.match(
    buildScript,
    /run_grype "\$candidate_image_id" \\\n\s*>"\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]grype[.]raw[.]json"/,
  );
  assert.match(
    buildScript,
    /run_grype "\$candidate_image_id" \\\n\s*--vex "\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]openvex[.]json" \\\n\s*--fail-on high/,
  );
  assert.match(buildScript, /env -i HOME="\$scanner_home" PATH="\$scanner_path"/);
  assert.match(buildScript, /run_grype db update/);
  assert.match(buildScript, /grype_db_sha_before=\$\(shasum -a 256 "\$grype_db_path"/);
  assert.match(buildScript, /Banco do Grype mudou durante os scans raw\/filtered/);
  assert.match(buildScript, /docuseal-3[.]0[.]1-maiocchi[.]15[.]scan-metadata[.]json/);
  assert.match(buildScript, /docuseal-3[.]0[.]1-maiocchi[.]15[.]native-packages[.]manifest/);
  assert.doesNotMatch(buildScript, /(?:run_syft|run_grype) "\$candidate_image"/);
  assert.match(buildScript, /printf '%s\\n' "\$candidate_image_id" >"\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]image-id[.]txt"/);
  assert.match(buildScript, /docuseal-3[.]0[.]1-maiocchi[.]15[.]image-id[.]txt/);
  for (const label of [
    "org.opencontainers.image.version",
    "org.opencontainers.image.revision",
    "br.adv.maiocchi.base-source-sha256",
    "br.adv.maiocchi.patch-sha256",
    "br.adv.maiocchi.build-inputs-patch-sha256",
    "br.adv.maiocchi.native-security-patch-sha256",
    "br.adv.maiocchi.tiff-apkbuild-sha256",
    "br.adv.maiocchi.tiff-source-sha256",
    "br.adv.maiocchi.tiff-version",
    "br.adv.maiocchi.openexr-version",
    "br.adv.maiocchi.ruby-base-digest",
    "br.adv.maiocchi.recipe-commit",
  ]) {
    assert.match(
      buildScript,
      new RegExp(`docker image inspect --format '[^\\n]*${label.replaceAll(".", "[.]")}[^\\n]*' "\\$candidate_image_id"`),
    );
  }
  assert.match(buildScript, /DOCUSEAL_SSO_CANDIDATE_IMAGE é obrigatório/);
  assert.match(buildScript, /3\[.\]0\[.\]1-maiocchi\[.\]15-sso-\$\{recipe_short\}-a\[0-9\]\[0-9\]/);
  assert.match(buildScript, /DOCUSEAL_SSO_EVIDENCE_DIR absoluto é obrigatório/);
  assert.match(buildScript, /Tag candidata já existe; sobrescrita recusada/);
  assert.match(addedBuildInputLines, /releases\/download\/chromium\/7947/);
  assert.doesNotMatch(addedBuildInputLines, /releases\/latest|refs\/heads\/(?:main|master)|\/raw\/master\//);
  assert.match(buildScript, /Diretório de evidência já existe; sobrescrita recusada/);
  assert.match(buildScript, /git -C "\$repo_dir" rev-parse --git-path ['"]?maiocchi-release-tag-locks['"]?/);
  assert.match(buildScript, /if ! mkdir "\$tag_lock_root\/\$tag_lock_key"; then/);
  assert.match(buildScript, /if ! mkdir "\$evidence_dir"; then/);
  assert.doesNotMatch(buildScript, /mkdir -p "\$evidence_dir"/);
  assert.match(buildScript, /apk info -e "tiff=4[.]7[.]2-r0"/);
  assert.match(buildScript, /libtiff[.]so[.]6[.]3[.]0 is owned by tiff-4[.]7[.]2-r0/);
  assert.match(buildScript, /ldd "\/\$libvips" \| grep -F "libtiff[.]so[.]6"/);
  assert.match(buildScript, /test "\$\(find [.] -type f -name "[*][.]rsa" \| wc -l\)" -eq 0/);
  assert.match(buildScript, /audit_output=\$\(apk audit --system\)\n\s*test -z "\$audit_output"/);
  assert.match(buildScript, /docker image inspect --format '\{\{[.]Config[.]User\}\}'[\s\S]*= 'docuseal'/);
  assert.equal(docusealContract.gates.runtime_user, "docuseal");
  assert.match(buildScript, /docuseal-3[.]0[.]1-maiocchi[.]15[.]tiff-4[.]7[.]2-r0[.]apk/);
  assert.match(buildScript, /docuseal-3[.]0[.]1-maiocchi[.]15[.]tiff-repository[.]SHA256SUMS/);
  assert.match(buildScript, /\$raw_high == \$allowed_high/);
  assert.match(buildScript, /[.]namespace == "vex"/);
  assert.match(buildScript, /[.]\["vex-status"\] == "fixed"/);
  assert.equal(docusealContract.status, "no-go-evidence-pending");
  assert.deepEqual(docusealContract.required_evidence, [
    "immutable-image-id",
    "image-inspect",
    "image-archive",
    "sbom",
    "raw-vulnerability-report",
    "openvex",
    "filtered-vulnerability-report",
    "scanner-metadata",
    "tiff-apk",
    "tiff-repository-manifest",
    "native-packages-manifest",
    "artifact-manifest",
  ]);
});

test("preflight vincula IDs imutáveis ao commit assinado, arquitetura e labels exatas", () => {
  assert.match(candidatePreflight, /PORTAL_SSO_EVIDENCE_DIR/);
  assert.match(candidatePreflight, /DOCUSEAL_SSO_EVIDENCE_DIR/);
  assert.match(candidatePreflight, /portal-\$portal_version[.]image-id[.]txt/);
  assert.match(candidatePreflight, /docuseal-\$docuseal_version[.]image-id[.]txt/);
  assert.match(candidatePreflight, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(candidatePreflight, /git -C "\$repo_dir" diff --quiet HEAD --/);
  assert.match(candidatePreflight, /git -C "\$repo_dir" diff --cached --quiet/);
  assert.match(candidatePreflight, /git -C "\$repo_dir" verify-commit "\$recipe_commit"/);
  assert.match(candidatePreflight, /actual=\$\(docker image inspect --format "\$inspect_format" "\$image_id"\)/);
  for (const imageId of ["portal_image_id", "docuseal_image_id"]) {
    assert.match(candidatePreflight, new RegExp(`expect_inspect "\\$${imageId}" '\\{\\{[.]Id\\}\\}' "\\$${imageId}"`));
    assert.match(candidatePreflight, new RegExp(`expect_inspect "\\$${imageId}" '\\{\\{[.]Os\\}\\}' 'linux'`));
    assert.match(candidatePreflight, new RegExp(`expect_inspect "\\$${imageId}" '\\{\\{[.]Architecture\\}\\}' 'amd64'`));
  }
  for (const label of [
    "org.opencontainers.image.version",
    "org.opencontainers.image.revision",
    "br.adv.maiocchi.base-commit",
    "br.adv.maiocchi.base-source-sha256",
    "br.adv.maiocchi.patch-sha256",
    "br.adv.maiocchi.build-inputs-patch-sha256",
    "br.adv.maiocchi.native-security-patch-sha256",
    "br.adv.maiocchi.tiff-apkbuild-sha256",
    "br.adv.maiocchi.tiff-source-sha256",
    "br.adv.maiocchi.tiff-version",
    "br.adv.maiocchi.openexr-version",
    "br.adv.maiocchi.ruby-base-digest",
    "br.adv.maiocchi.recipe-commit",
  ]) {
    assert.match(candidatePreflight, new RegExp(label.replaceAll(".", "[.]")));
  }
  assert.match(candidatePreflight, /PORTAL_SSO_CANDIDATE_IMAGE_ID/);
  assert.match(candidatePreflight, /DOCUSEAL_SSO_CANDIDATE_IMAGE_ID/);
  assert.match(candidatePreflight, /archive_layer_projection_sha256/);
  assert.match(candidatePreflight, /embedded_layer_projection_sha256/);
  assert.match(candidatePreflight, /número de camadas Grype diverge dos diff IDs/);
  assert.match(candidatePreflight, /\(\$raw_hc \| length\) == 2/);
  assert.match(candidatePreflight, /\["CVE-2023-52356", "CVE-2026-4775"\]/);
  assert.match(candidatePreflight, /def normalized_matches:[\s\S]*map\(del\([.]appliedIgnoreRules\)\)/);
  assert.match(candidatePreflight, /artifact[.]purl == "pkg:apk\/alpine\/tiff@4[.]7[.]2-r0/);
  assert.match(candidatePreflight, /[.]match == \{[\s\S]*stock:\{"using-cpes":true\}/);
  assert.match(candidatePreflight, /\$vex_at <= \$raw_at[\s\S]*\$raw_at <= \$filtered_at/);
  assert.match(candidatePreflight, /--entrypoint \/sbin\/apk[\s\S]*manifest \\\n\s*tiff/);
  assert.match(candidatePreflight, /cmp -s "\$runtime_tmp\/evidence[.]sorted" "\$runtime_tmp\/runtime[.]sorted"/);
  assert.match(candidatePreflight, /audit --system/);
  assert.match(candidatePreflight, /apk audit detectou arquivo de pacote divergente/);
  assert.match(candidatePreflight, /allowlist fechada de severidades do Portal foi violada/);
  assert.match(candidatePreflight, /expect_inspect "\$docuseal_image_id" '\{\{[.]Config[.]User\}\}' 'docuseal'/);
  assert.match(candidatePreflight, /574df1a0862ff88ad933be214e81069e35b17618a13e019f8f1c84fe063222a2/);
  assert.match(candidatePreflight, /05ffd2c28a607e48fb2269d9aac5b3d53e8a51bbac501946644745eae2119907/);
});

test("preflight fecha TOCTOU relendo os IDs depois de validar o manifesto", () => {
  assert.match(candidatePreflight, /SHA256SUMS/);
  assert.match(candidatePreflight, /manifest_line_count[\s\S]*-eq "\$#"/);
  assert.match(candidatePreflight, /\[ "\$actual_names" = "\$expected_names" \]/);
  assert.match(candidatePreflight, /\[ -f "\$evidence_file" \] && \[ ! -L "\$evidence_file" \]/);
  assert.match(candidatePreflight, /shasum -a 256 -c SHA256SUMS/);
  for (const [prefix, evidenceLabel] of [
    ["portal", "Portal"],
    ["docuseal", "DocuSeal"],
  ]) {
    const readBefore = candidatePreflight.indexOf(`${prefix}_image_id_before=$(read_image_id`);
    const manifestValidation = candidatePreflight.indexOf(`validate_evidence_set "$${prefix}_evidence_dir" '${evidenceLabel}'`);
    const readAfter = candidatePreflight.indexOf(`${prefix}_image_id=$(read_image_id`);
    assert.ok(readBefore >= 0 && readBefore < manifestValidation && manifestValidation < readAfter);
    assert.match(
      candidatePreflight,
      new RegExp(`\\[ "\\$${prefix}_image_id" = "\\$${prefix}_image_id_before" \\] \\|\\| fail`),
    );
  }
});

test("auditoria de índices valida blobs antes e depois dos quatro patches da receita", () => {
  assert.match(patchIndexValidator, /patches\/portal\/0001-maiocchi-sso-portal-1[.]15[.]1[.]patch/);
  assert.match(patchIndexValidator, /patches\/docuseal\/0009-maiocchi-uno-sso[.]patch/);
  assert.match(patchIndexValidator, /patches\/docuseal\/0010-pin-build-inputs[.]patch/);
  assert.match(patchIndexValidator, /patches\/docuseal\/0011-update-native-image-libraries[.]patch/);
  assert.match(patchIndexValidator, /actual_hash=\$\(git hash-object "\$source_dir\/\$old_path"\)/);
  assert.match(patchIndexValidator, /actual_hash=\$\(git hash-object "\$source_dir\/\$new_path"\)/);
  for (const counter of ["diff_count", "index_count", "index_seen"]) {
    assert.match(patchIndexValidator, new RegExp(`\\b${counter}\\b`));
  }
  assert.match(
    patchIndexValidator,
    /\[ "\$diff_count" -eq 0 \] \|\| \[ "\$index_seen" -ne 1 \] \|\| \[ "\$diff_count" -ne "\$index_count" \]/,
  );
  assert.match(patchIndexValidator, /\[ "\$diff_count" -gt 0 \] && \[ "\$index_seen" -ne 1 \]/);
  assert.match(patchIndexValidator, /index_seen=\$\(\(index_seen \+ 1\)\)[\s\S]*\[ "\$index_seen" -ne 1 \]/);
  for (const [sourceVariable, patchVariable] of [
    ["portal_source", "portal_patch"],
    ["docuseal_source", "docuseal_patch"],
    ["docuseal_source", "docuseal_build_inputs_patch"],
    ["docuseal_source", "docuseal_native_security_patch"],
  ]) {
    for (const phase of ["before", "after"]) {
      assert.match(
        patchIndexValidator,
        new RegExp(`audit_patch_indexes "\\$${sourceVariable}" "\\$${patchVariable}" ${phase}`),
      );
    }
  }
  assert.equal((patchIndexValidator.match(/^audit_patch_indexes "\$/gm) || []).length, 8);
  assert.ok((patchIndexValidator.match(/git -C "\$docuseal_source" apply --check/g) || []).length >= 3);
  assert.match(patchIndexValidator, /audit_patch_hunks\(\)/);
  for (const counter of ["old_remaining", "new_remaining", "hunk_count"]) {
    assert.match(patchIndexValidator, new RegExp(`\\b${counter}\\b`));
  }
  assert.match(patchIndexValidator, /function range_count\(/);
  assert.match(patchIndexValidator, /\^@@ \/[\s\S]*old_remaining = range_count\(\$2, "-"\)/);
  assert.match(patchIndexValidator, /new_remaining = range_count\(\$3, "\+"\)/);
  assert.match(patchIndexValidator, /contagem declarada não corresponde ao conteúdo/);
  assert.match(patchIndexValidator, /conteúdo excede a contagem declarada/);
  assert.match(patchIndexValidator, /linha com aparência de conteúdo fora de hunk/);
  assert.match(patchIndexValidator, /audit_patch_line_accounting\(\)/);
  assert.match(patchIndexValidator, /raw_counts=\$\(awk/);
  assert.match(patchIndexValidator, /git apply --numstat "\$patch_file"/);
  assert.match(patchIndexValidator, /"\$raw_added" -eq "\$applied_added"/);
  assert.match(patchIndexValidator, /"\$raw_deleted" -eq "\$applied_deleted"/);
  for (const patchVariable of [
    "portal_patch",
    "docuseal_patch",
    "docuseal_build_inputs_patch",
    "docuseal_native_security_patch",
  ]) {
    assert.match(
      patchIndexValidator,
      new RegExp(`audit_patch_hunks "\\$${patchVariable}"\\naudit_patch_line_accounting "\\$${patchVariable}"`),
    );
    assert.match(patchIndexValidator, new RegExp(`audit_patch_line_accounting "\\$${patchVariable}"`));
  }
  assert.equal((patchIndexValidator.match(/^audit_patch_hunks "\$/gm) || []).length, 4);
  assert.equal((patchIndexValidator.match(/^audit_patch_line_accounting "\$/gm) || []).length, 4);
});

test("wrapper expõe somente verbos governados e executa os dois preflights antes do up", () => {
  assert.match(candidateComposeRunner, /validate-sso-candidate-images[.]sh/);
  assert.match(candidateComposeRunner, /validate-sso-e2e-runtime[.]sh/);
  assert.match(candidateComposeRunner, /export[^\n]*PORTAL_SSO_CANDIDATE_IMAGE_ID[^\n]*DOCUSEAL_SSO_CANDIDATE_IMAGE_ID/);
  assert.match(candidateComposeRunner, /"\$image_validator"[\s\S]*"\$runtime_validator"[\s\S]*compose config --quiet/);
  assert.match(candidateComposeRunner, /--file "\$repo_dir\/deploy\/sso-e2e-gateway[.]candidate[.]yml"/);
  assert.match(candidateComposeRunner, /--wait-timeout 900/);
  assert.match(candidateComposeRunner, /--force-recreate/);
  assert.match(candidateComposeRunner, /compose --profile e2e run --rm --no-deps sso-e2e-probe-candidate/);
  assert.match(candidateComposeRunner, /compose down --remove-orphans --timeout 30/);
  assert.doesNotMatch(candidateComposeRunner, /\$@/);
});

test("wrapper rejeita argumentos livres antes de tocar Docker", () => {
  const runnerPath = fileURLToPath(new URL("../scripts/run-sso-candidate-compose.sh", import.meta.url));
  for (const [args, expectedError] of [
    [["run"], /Subcomando inválido/],
    [["config", "--environment", "json"], /Uso: run-sso-candidate-compose/],
  ]) {
    const result = spawnSync("/bin/sh", [runnerPath, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expectedError);
  }
});

test("canário do portal é privado e não substitui o container produtivo", () => {
  assert.match(portalOverlay, /portal-sso-candidate:/);
  assert.doesNotMatch(portalOverlay, /container_name:|^\s+name:\s+signature-sso-candidate/m);
  assert.match(portalOverlay, /image: "\$\{PORTAL_SSO_CANDIDATE_IMAGE_ID:[?]defina o image ID sha256 validado pelo preflight\}"/);
  assert.doesNotMatch(portalOverlay, /\$\{PORTAL_SSO_CANDIDATE_IMAGE:[?:]/);
  assert.match(portalOverlay, /internal: true/);
  assert.doesNotMatch(portalOverlay, /ports:|traefik[.]http/);
  assert.equal(portalContract.gates.canary, "project-scoped candidate service on an internal-only network; no public router");
});
