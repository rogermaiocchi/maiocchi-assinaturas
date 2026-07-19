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
  access,
  traefik,
  overlay,
  buildScript,
  docusealPg16Harness,
  docusealPg16Dockerfile,
  candidatePreflight,
  candidateComposeRunner,
  patchIndexValidator,
] = await Promise.all([
  readFile(new URL("../compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz", import.meta.url)),
  readFile(new URL("../patches/docuseal/0009-maiocchi-uno-sso.patch", import.meta.url), "utf8"),
  readFile(new URL("../patches/docuseal/0010-pin-build-inputs.patch", import.meta.url), "utf8"),
  readFile(new URL("../app/lawyer-access.tsx", import.meta.url), "utf8"),
  readFile(new URL("../deploy/traefik-assinatura.yml", import.meta.url), "utf8"),
  readFile(new URL("../deploy/docuseal-sso.candidate.yml", import.meta.url), "utf8"),
  readFile(new URL("../scripts/build-docuseal-sso-candidate.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/test-docuseal-sso-pg16-isolated.sh", import.meta.url), "utf8"),
  readFile(new URL("../tests/docuseal-sso-pg16/Dockerfile", import.meta.url), "utf8"),
  readFile(new URL("../scripts/validate-sso-candidate-images.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/run-sso-candidate-compose.sh", import.meta.url), "utf8"),
  readFile(new URL("../scripts/validate-release-patch-indexes.sh", import.meta.url), "utf8"),
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
    "752e6ff168f093169dd120d509da4a10c79c04e2967799327edb0ef5e92481bc",
  );
  assert.match(buildScript, /git -C "\$candidate_work" apply --check "\$sso_patch"/);
  assert.match(buildScript, /git -C "\$candidate_work" apply --check "\$build_inputs_patch"/);
  assert.match(patch, /20260718090100_install_maiocchi_sso_guards[.]rb/);
  assert.match(patch, /Rails carrega schema[.]rb em bancos vazios/);
  assert.match(patch, /CREATE OR REPLACE FUNCTION guard_maiocchi_sso_identity_binding/);
});

test("browser flow fixa endpoints, PKCE S256, state use-once e sessão host-only", () => {
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
  assert.doesNotMatch(overlay, /^\s{2}docuseal:/m);
  assert.doesNotMatch(overlay, /^\s{2}docuseal-db:/m);
  assert.match(overlay, /postgres:16-alpine@sha256:[0-9a-f]{64}/);
  assert.match(overlay, /DOCUSEAL_CANARY_SECRET_DIR:[?]/);
  assert.match(overlay, /internal: true/);
  assert.doesNotMatch(overlay, /ports:|traefik-net|signature-internal|DOCUSEAL_DATA_DIR|DOCUSEAL_PGDATA_DIR/);
});

test("harness PG16 entrega tmpfs gravável somente ao usuário não-root da aplicação", () => {
  assert.match(docusealPg16Harness, /uid=2100,gid=2100,mode=0700/);
  assert.equal((docusealPg16Harness.match(/uid=2100,gid=2100,mode=0700/g) || []).length, 3);
  assert.match(docusealPg16Harness, /--tmpfs '\/app\/tmp:[^']*uid=2100,gid=2100,mode=0700'/);
  assert.doesNotMatch(docusealPg16Harness, /--tmpfs '\/app\/(?:log|storage|tmp):[^']*mode=0?777/);
});

test("harness PG16 carrega PDFium pelo mesmo release e hash do candidato", () => {
  assert.doesNotMatch(docusealPg16Dockerfile, /^#\s*syntax=/m);
  assert.match(docusealPg16Dockerfile, /releases\/download\/chromium\/7947\/pdfium-linux-musl-x64[.]tgz/);
  assert.match(docusealPg16Dockerfile, /4fd8d95a629dfd5009f81ddb32b54b96e113d6fdc1c4801aae5e2fb37911c91b/);
  assert.match(docusealPg16Dockerfile, /COPY --from=docuseal-sso-pdfium \/pdfium-linux\/lib\/libpdfium[.]so \/usr\/lib\/libpdfium[.]so/);
  assert.doesNotMatch(docusealPg16Dockerfile, /releases\/latest|refs\/heads\/(?:main|master)/);
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
  assert.match(portalBuild, /syft "\$candidate_image_id" --from docker -o cyclonedx-json/);
  assert.match(portalBuild, /grype "\$candidate_image_id" --from docker -o json/);
  assert.match(portalBuild, /grype "\$candidate_image_id" --from docker --fail-on high/);
  assert.doesNotMatch(portalBuild, /(?:syft|grype) "\$candidate_image"/);
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
  assert.equal(portalContract.status, "no-go-evidence-pending");
  assert.deepEqual(portalContract.required_evidence.map(({ kind }) => kind), [
    "immutable-image-id", "image-inspect", "image-archive", "sbom", "vulnerability-report", "artifact-manifest",
  ]);
  for (const line of portalDockerfile.match(/^FROM .+$/gm) || []) {
    assert.match(line, /@sha256:[0-9a-f]{64}/);
  }
});

test("build DocuSeal fixa a base Ruby e exige evidência antes de promoção", () => {
  const addedBuildInputLines = buildInputsPatch
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  assert.match(buildScript, /ruby_base_digest='sha256:[0-9a-f]{64}'/);
  assert.match(buildScript, /git -C "\$repo_dir" diff --quiet HEAD --/);
  assert.match(buildScript, /git -C "\$repo_dir" diff --cached --quiet/);
  assert.match(buildScript, /git -C "\$repo_dir" verify-commit "\$recipe_commit"/);
  assert.match(buildScript, /RUBY_VERSION'\)" = '4[.]0[.]5'/);
  assert.match(buildScript, /FROM \$\{ruby_base\}@\$\{ruby_base_digest\}/);
  assert.match(buildScript, /candidate_image_id=\$\(docker image inspect --format '\{\{[.]Id\}\}' "\$candidate_image"\)/);
  assert.match(buildScript, /docker image inspect "\$candidate_image_id" >"\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]image-inspect[.]json"/);
  assert.match(buildScript, /docker image save --output "\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]docker-image[.]tar" "\$candidate_image_id"/);
  assert.match(buildScript, /syft "\$candidate_image_id" --from docker -o cyclonedx-json/);
  assert.match(buildScript, /grype "\$candidate_image_id" --from docker -o json/);
  assert.match(buildScript, /grype "\$candidate_image_id" --from docker --fail-on high/);
  assert.doesNotMatch(buildScript, /(?:syft|grype) "\$candidate_image"/);
  assert.match(buildScript, /printf '%s\\n' "\$candidate_image_id" >"\$evidence_dir\/docuseal-3[.]0[.]1-maiocchi[.]15[.]image-id[.]txt"/);
  assert.match(buildScript, /docuseal-3[.]0[.]1-maiocchi[.]15[.]image-id[.]txt/);
  for (const label of [
    "org.opencontainers.image.version",
    "org.opencontainers.image.revision",
    "br.adv.maiocchi.base-source-sha256",
    "br.adv.maiocchi.patch-sha256",
    "br.adv.maiocchi.build-inputs-patch-sha256",
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
    "br.adv.maiocchi.ruby-base-digest",
    "br.adv.maiocchi.recipe-commit",
  ]) {
    assert.match(candidatePreflight, new RegExp(label.replaceAll(".", "[.]")));
  }
  assert.match(candidatePreflight, /PORTAL_SSO_CANDIDATE_IMAGE_ID/);
  assert.match(candidatePreflight, /DOCUSEAL_SSO_CANDIDATE_IMAGE_ID/);
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

test("auditoria de índices valida blobs antes e depois dos três patches da receita", () => {
  assert.match(patchIndexValidator, /patches\/portal\/0001-maiocchi-sso-portal-1[.]15[.]1[.]patch/);
  assert.match(patchIndexValidator, /patches\/docuseal\/0009-maiocchi-uno-sso[.]patch/);
  assert.match(patchIndexValidator, /patches\/docuseal\/0010-pin-build-inputs[.]patch/);
  assert.match(patchIndexValidator, /actual_hash=\$\(git hash-object "\$source_dir\/\$old_path"\)/);
  assert.match(patchIndexValidator, /actual_hash=\$\(git hash-object "\$source_dir\/\$new_path"\)/);
  assert.ok((patchIndexValidator.match(/audit_patch_indexes/g) || []).length >= 7);
  assert.ok((patchIndexValidator.match(/git -C "\$docuseal_source" apply --check/g) || []).length >= 2);
});

test("wrapper executa o preflight imediatamente antes do compose sem hardcode de up", () => {
  assert.match(candidateComposeRunner, /validate-sso-candidate-images[.]sh/);
  assert.match(candidateComposeRunner, /export[^\n]*PORTAL_SSO_CANDIDATE_IMAGE_ID[^\n]*DOCUSEAL_SSO_CANDIDATE_IMAGE_ID/);
  assert.match(candidateComposeRunner, /"\$validator"\nexec docker compose/);
  assert.match(candidateComposeRunner, /-f\s*\|\s*-f[?][*]\s*\|\s*--file\s*\|\s*--file=[*]/);
  assert.match(candidateComposeRunner, /--project-directory|--project-name|--env-file/);
  assert.doesNotMatch(candidateComposeRunner, /exec docker compose[^\n]*\bup\b/);
});

test("wrapper rejeita run e config --environment e exige config não interpolado", () => {
  const runnerPath = fileURLToPath(new URL("../scripts/run-sso-candidate-compose.sh", import.meta.url));
  for (const [args, expectedError] of [
    [["run"], /Subcomando Compose não permitido/],
    [["config", "--environment", "json"], /Config só é permitido com --quiet e --no-interpolate/],
  ]) {
    const result = spawnSync("/bin/sh", [runnerPath, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expectedError);
  }

  const allowedCommands = candidateComposeRunner
    .split("\n")
    .find((line) => line.trimStart().startsWith("up | create |"));
  assert.ok(allowedCommands, "a allowlist explícita de subcomandos deve existir");
  assert.doesNotMatch(allowedCommands, /(?:^|\s)run(?:\s|$)/);
  assert.match(candidateComposeRunner, /config\)[\s\S]*\[ "\$#" -eq 3 \][\s\S]*--quiet:--no-interpolate/);
  assert.match(candidateComposeRunner, /--no-interpolate:--quiet/);
  assert.match(candidateComposeRunner, /--environment\s*\|\s*--environment=[*]/);
});

test("canário do portal é privado e não substitui o container produtivo", () => {
  assert.match(portalOverlay, /portal-sso-candidate:/);
  assert.match(portalOverlay, /container_name: assinatura-portal-sso-candidate/);
  assert.match(portalOverlay, /image: "\$\{PORTAL_SSO_CANDIDATE_IMAGE_ID:[?]defina o image ID sha256 validado pelo preflight\}"/);
  assert.doesNotMatch(portalOverlay, /\$\{PORTAL_SSO_CANDIDATE_IMAGE:[?:]/);
  assert.match(portalOverlay, /internal: true/);
  assert.doesNotMatch(portalOverlay, /ports:|traefik[.]http|container_name: assinatura-portal\s/);
  assert.equal(portalContract.gates.canary, "candidate service has a unique container name and an internal-only network; no public router");
});
