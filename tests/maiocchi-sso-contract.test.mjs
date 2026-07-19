import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [baseArchive, patch, buildInputsPatch, access, traefik, overlay, buildScript] = await Promise.all([
  readFile(new URL("../compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz", import.meta.url)),
  readFile(new URL("../patches/docuseal/0009-maiocchi-uno-sso.patch", import.meta.url), "utf8"),
  readFile(new URL("../patches/docuseal/0010-pin-build-inputs.patch", import.meta.url), "utf8"),
  readFile(new URL("../app/lawyer-access.tsx", import.meta.url), "utf8"),
  readFile(new URL("../deploy/traefik-assinatura.yml", import.meta.url), "utf8"),
  readFile(new URL("../deploy/docuseal-sso.candidate.yml", import.meta.url), "utf8"),
  readFile(new URL("../scripts/build-docuseal-sso-candidate.sh", import.meta.url), "utf8"),
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
  assert.doesNotMatch(patch, /domain:/);
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
  assert.match(overlay, /image: maiocchi\/docuseal:3[.]0[.]1-maiocchi[.]15/);
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

test("portal estático possui candidato 1.15.1 derivado de snapshot imutável", () => {
  const patchSha = createHash("sha256").update(portalPatch).digest("hex");
  assert.equal(patchSha, "272c65dd0b932f127b53f0556fb1be814a066367a56acb613e37d1acf46b7c50");
  assert.equal(portalContract.source_patch.sha256, patchSha);
  assert.equal(portalContract.base_commit, "7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d");
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
  assert.match(portalBuild, /git -C "\$source_dir" apply --check "\$portal_patch"/);
  assert.match(portalBuild, /npm run build[\s\S]*node --test tests\/\*[.]test[.]mjs[\s\S]*npm run lint/);
  assert.match(portalBuild, /syft "\$candidate_image" -o cyclonedx-json/);
  assert.match(portalBuild, /grype "\$candidate_image" -o json/);
  assert.match(portalBuild, /grype "\$candidate_image" --fail-on high/);
  assert.match(portalBuild, /docker image save --output/);
  assert.match(portalBuild, /br[.]adv[.]maiocchi[.]recipe-commit/);
  assert.match(portalBuild, /Diretório de evidência já existe; sobrescrita recusada/);
  assert.equal(portalContract.status, "no-go-evidence-pending");
  assert.deepEqual(portalContract.required_evidence.map(({ kind }) => kind), [
    "image-inspect", "image-archive", "sbom", "vulnerability-report", "artifact-manifest",
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
  assert.match(buildScript, /FROM \$\{ruby_base\}@\$\{ruby_base_digest\}/);
  assert.match(buildScript, /syft "\$candidate_image" -o cyclonedx-json/);
  assert.match(buildScript, /grype "\$candidate_image" -o json/);
  assert.match(buildScript, /grype "\$candidate_image" --fail-on high/);
  assert.match(buildScript, /docker image save --output/);
  assert.match(addedBuildInputLines, /releases\/download\/chromium\/7947/);
  assert.doesNotMatch(addedBuildInputLines, /releases\/latest|refs\/heads\/(?:main|master)|\/raw\/master\//);
  assert.match(buildScript, /Diretório de evidência já existe; sobrescrita recusada/);
});

test("canário do portal é privado e não substitui o container produtivo", () => {
  assert.match(portalOverlay, /portal-sso-candidate:/);
  assert.match(portalOverlay, /container_name: assinatura-portal-sso-candidate/);
  assert.match(portalOverlay, /image: maiocchi\/assinatura-portal:1[.]15[.]1/);
  assert.match(portalOverlay, /internal: true/);
  assert.doesNotMatch(portalOverlay, /ports:|traefik[.]http|container_name: assinatura-portal\s/);
  assert.equal(portalContract.gates.canary, "candidate service has a unique container name and an internal-only network; no public router");
});
