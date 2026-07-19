#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
base_commit='7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d'
portal_patch="$repo_dir/patches/portal/0001-maiocchi-sso-portal-1.15.1.patch"
syft_config="$repo_dir/compliance/config/syft-candidate.yaml"
grype_config="$repo_dir/compliance/config/grype-candidate.yaml"
expected_patch_sha='d088a5a8fdcde66e12ab747dad9a4477de39513f168dbb61bad264a92e19be66'
expected_syft_config_sha='8d154f9e73d36bc74ae76d45b76020ec3ad591e81325f0a626ec2d9f67d0b893'
expected_grype_config_sha='50b1ced07b248a9044339b243c85957608de3ed8869f296ec8ed58ef21b11d8d'
expected_syft_version='1.46.0'
expected_syft_git_commit='b15c5dbfe2bb21c9d73002c1056a829c8c411c75'
expected_syft_build_date='2026-06-26T09:36:01Z'
expected_syft_go_version='go1.26.3'
expected_syft_schema_version='16.1.5'
expected_syft_binary_sha256='574df1a0862ff88ad933be214e81069e35b17618a13e019f8f1c84fe063222a2'
expected_syft_release_archive_url='https://github.com/anchore/syft/releases/download/v1.46.0/syft_1.46.0_linux_amd64.tar.gz'
expected_syft_release_archive_sha256='d654f678b709eb53c393d38519d5ed7d2e57205529404018614cfefa0fb2b5ca'
expected_grype_version='0.115.0'
expected_grype_git_commit='fa8b7e2a528cf1f8b098123f256c61db9e5df69c'
expected_grype_build_date='2026-06-26T11:33:27Z'
expected_grype_go_version='go1.26.3'
expected_grype_supported_db_schema='6'
expected_grype_binary_sha256='05ffd2c28a607e48fb2269d9aac5b3d53e8a51bbac501946644745eae2119907'
expected_grype_release_archive_url='https://github.com/anchore/grype/releases/download/v0.115.0/grype_0.115.0_linux_amd64.tar.gz'
expected_grype_release_archive_sha256='3fad92940650e514c0aa2dad83526942a055e210cec09a8a59d9c024adc2b90e'
grype_db_max_age_seconds='86400'
candidate_version='1.15.1'
candidate_image="${PORTAL_SSO_CANDIDATE_IMAGE:-}"
recipe_commit=$(git -C "$repo_dir" rev-parse HEAD)
recipe_short=$(printf '%s' "$recipe_commit" | cut -c1-12)

git -C "$repo_dir" diff --quiet HEAD -- || {
  printf '%s\n' 'Worktree rastreada diverge do commit da receita.' >&2
  exit 1
}
git -C "$repo_dir" diff --cached --quiet || {
  printf '%s\n' 'Índice Git diverge do commit da receita.' >&2
  exit 1
}
git -C "$repo_dir" verify-commit "$recipe_commit" >/dev/null 2>&1 || {
  printf '%s\n' 'Commit da receita não possui assinatura Git verificável.' >&2
  exit 1
}

git -C "$repo_dir" cat-file -e "$base_commit^{commit}"
actual_patch_sha=$(shasum -a 256 "$portal_patch" | awk '{print $1}')
[ "$actual_patch_sha" = "$expected_patch_sha" ] || {
  printf '%s\n' 'Patch do portal SSO divergiu do hash aprovado.' >&2
  exit 1
}
for scanner_config in "$syft_config" "$grype_config"; do
  [ -f "$scanner_config" ] && [ ! -L "$scanner_config" ] || {
    printf '%s\n' 'Configuração de scanner deve ser arquivo regular versionado, não link simbólico.' >&2
    exit 1
  }
done
[ "$(shasum -a 256 "$syft_config" | awk '{print $1}')" = "$expected_syft_config_sha" ] || {
  printf '%s\n' 'Configuração hermética do Syft divergiu do hash aprovado.' >&2
  exit 1
}
[ "$(shasum -a 256 "$grype_config" | awk '{print $1}')" = "$expected_grype_config_sha" ] || {
  printf '%s\n' 'Configuração hermética do Grype divergiu do hash aprovado.' >&2
  exit 1
}

candidate_work=$(mktemp -d "${TMPDIR:-/tmp}/portal-sso-candidate.XXXXXX")
cleanup() {
  case "$candidate_work" in
    "${TMPDIR:-/tmp}"/portal-sso-candidate.*) rm -rf -- "$candidate_work" ;;
    *) printf '%s\n' 'Diretório temporário inesperado; limpeza recusada.' >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

base_archive="$candidate_work/base.tar"
source_dir="$candidate_work/source"
mkdir -p "$source_dir"
git -C "$repo_dir" archive --format=tar --output="$base_archive" "$base_commit"
tar -xf "$base_archive" -C "$source_dir"
git -C "$source_dir" apply --check "$portal_patch"
git -C "$source_dir" apply "$portal_patch"

source_node_bin="${PORTAL_SSO_NODE_BIN:-}"
if [ -z "$source_node_bin" ]; then
  for node_candidate in "$(command -v node 2>/dev/null || true)" /opt/homebrew/opt/node@22/bin/node; do
    [ -x "$node_candidate" ] || continue
    "$node_candidate" -e '
      const [major, minor] = process.versions.node.split(".").map(Number);
      process.exit(major === 22 && minor >= 13 ? 0 : 1);
    ' || continue
    source_node_bin="$node_candidate"
    break
  done
fi
[ -x "$source_node_bin" ] || {
  printf '%s\n' 'Node.js 22 não está disponível para a auditoria do snapshot.' >&2
  exit 1
}
"$source_node_bin" -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  process.exit(major === 22 && minor >= 13 ? 0 : 1);
' || {
  printf '%s\n' 'Node.js 22.13 ou superior, dentro da major 22, é obrigatório.' >&2
  exit 1
}
source_node_dir=$(dirname -- "$source_node_bin")
[ -x "$source_node_dir/npm" ] || {
  printf '%s\n' 'npm correspondente ao Node.js 22 não está disponível.' >&2
  exit 1
}
host_path=${PATH:?PATH é obrigatório para executar a auditoria e os scanners}

"$source_node_bin" -e '
  const fs = require("node:fs");
  const [pkgPath, lockPath, expected] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  if (pkg.version !== expected || lock.version !== expected || lock.packages[""].version !== expected) process.exit(1);
' "$source_dir/package.json" "$source_dir/package-lock.json" "$candidate_version"
grep -Fq 'org.opencontainers.image.version="1.15.1"' "$source_dir/Dockerfile"
grep -Fq 'image: maiocchi/assinatura-portal:1.15.1' "$source_dir/compose.yml"
grep -Fq 'Entrar com Portal Maiocchi' "$source_dir/app/lawyer-access.tsx"
grep -Fq 'window.location.assign("/sso/maiocchi/start")' "$source_dir/app/lawyer-access.tsx"

if [ "${PORTAL_SSO_VERIFY_ONLY:-false}" = 'true' ]; then
  printf '%s\n' "Fonte candidata verificável: $base_commit + $actual_patch_sha"
  exit 0
fi

[ -n "$candidate_image" ] || {
  printf '%s\n' 'PORTAL_SSO_CANDIDATE_IMAGE é obrigatório para impedir tag reutilizável.' >&2
  exit 1
}
printf '%s\n' "$candidate_image" | grep -Eq "^maiocchi/assinatura-portal:1[.]15[.]1-sso-${recipe_short}-a[0-9][0-9]$" || {
  printf '%s\n' 'Tag candidata do portal não está vinculada ao commit e à tentativa.' >&2
  exit 1
}

evidence_dir="${PORTAL_SSO_EVIDENCE_DIR:-}"
[ -n "$evidence_dir" ] && [ "${evidence_dir#/}" != "$evidence_dir" ] || {
  printf '%s\n' 'PORTAL_SSO_EVIDENCE_DIR absoluto é obrigatório.' >&2
  exit 1
}

(
  cd "$source_dir"
  PATH="$source_node_dir:$host_path"
  export PATH
  SHARP_IGNORE_GLOBAL_LIBVIPS=1
  export SHARP_IGNORE_GLOBAL_LIBVIPS
  NEXT_TELEMETRY_DISABLED=1
  export NEXT_TELEMETRY_DISABLED
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major === 22 && minor >= 13 ? 0 : 1);
  '
  npm ci
  npm run build
  node --test tests/*.test.mjs
  npm run lint
)

if [ "${PORTAL_SSO_SOURCE_AUDIT_ONLY:-false}" = 'true' ]; then
  printf '%s\n' 'Build, testes e lint do snapshot candidato concluídos; imagem não construída.'
  exit 0
fi

for required_tool in docker syft grype jq env; do
  command -v "$required_tool" >/dev/null 2>&1 || {
    printf '%s\n' "$required_tool não está disponível; evidência candidata não foi produzida." >&2
    exit 1
  }
done

scanner_home=${HOME:?HOME é obrigatório para o cache validado do Grype}
scanner_path=$host_path
syft_bin=$(command -v syft)
grype_bin=$(command -v grype)
case "$syft_bin:$grype_bin" in
  /*:/*) ;;
  *) printf '%s\n' 'Scanners devem resolver para caminhos absolutos.' >&2; exit 1 ;;
esac
verify_scanner_binary() (
  scanner_bin=$1
  expected_sha256=$2
  scanner_label=$3
  [ -f "$scanner_bin" ] && [ ! -L "$scanner_bin" ] && [ -x "$scanner_bin" ] || {
    printf '%s\n' "$scanner_label deve ser executável regular, não link simbólico." >&2
    exit 1
  }
  [ "$(shasum -a 256 "$scanner_bin" | awk '{print $1}')" = "$expected_sha256" ] || {
    printf '%s\n' "$scanner_label diverge do asset oficial aprovado." >&2
    exit 1
  }
)
verify_scanner_binary "$syft_bin" "$expected_syft_binary_sha256" 'Binário Syft'
verify_scanner_binary "$grype_bin" "$expected_grype_binary_sha256" 'Binário Grype'
run_syft() {
  env -i HOME="$scanner_home" PATH="$scanner_path" \
    "$syft_bin" --config "$syft_config" "$@"
}
run_grype() {
  env -i HOME="$scanner_home" PATH="$scanner_path" \
    "$grype_bin" --config "$grype_config" "$@"
}

syft_version_json=$(run_syft version -o json)
grype_version_json=$(run_grype version -o json)
jq -e \
  --arg version "$expected_syft_version" \
  --arg git_commit "$expected_syft_git_commit" \
  --arg build_date "$expected_syft_build_date" \
  --arg go_version "$expected_syft_go_version" \
  --arg schema_version "$expected_syft_schema_version" '
    (keys == [
      "application", "buildDate", "compiler", "gitCommit", "gitDescription",
      "goVersion", "platform", "schemaVersion", "version"
    ]) and
    .application == "syft" and
    .version == $version and
    .gitCommit == $git_commit and
    .gitDescription == ("v" + $version) and
    .buildDate == $build_date and
    .compiler == "gc" and
    .goVersion == $go_version and
    .platform == "linux/amd64" and
    .schemaVersion == $schema_version
  ' >/dev/null <<EOF
$syft_version_json
EOF
jq -e \
  --arg version "$expected_grype_version" \
  --arg git_commit "$expected_grype_git_commit" \
  --arg build_date "$expected_grype_build_date" \
  --arg go_version "$expected_grype_go_version" \
  --argjson supported_db_schema "$expected_grype_supported_db_schema" \
  --arg syft_version "v$expected_syft_version" '
    (keys == [
      "application", "buildDate", "compiler", "gitCommit", "gitDescription",
      "goVersion", "platform", "supportedDbSchema", "syftVersion", "version"
    ]) and
    .application == "grype" and
    .version == $version and
    .gitCommit == $git_commit and
    .gitDescription == ("v" + $version) and
    .buildDate == $build_date and
    .compiler == "gc" and
    .goVersion == $go_version and
    .platform == "linux/amd64" and
    .supportedDbSchema == $supported_db_schema and
    .syftVersion == $syft_version
  ' >/dev/null <<EOF
$grype_version_json
EOF

run_syft config --load >"$candidate_work/syft-config.loaded.yaml"
run_grype config --load >"$candidate_work/grype-config.loaded.yaml"
[ "$(grep -Fxc 'check-for-app-update: false' "$candidate_work/syft-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'check-for-app-update: false' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'ignore: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'exclude: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'vex-documents: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc 'vex-add: []' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  auto-update: false' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  validate-by-hash-on-start: true' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  validate-age: true' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
[ "$(grep -Fxc '  max-allowed-built-age: 24h0m0s' "$candidate_work/grype-config.loaded.yaml")" -eq 1 ]
run_grype db update >/dev/null

evidence_parent=$(dirname -- "$evidence_dir")
[ -d "$evidence_parent" ] && [ ! -L "$evidence_parent" ] || {
  printf '%s\n' 'Diretório-pai de evidência deve existir e não pode ser link simbólico.' >&2
  exit 1
}

tag_lock_root=$(git -C "$repo_dir" rev-parse --git-path maiocchi-release-tag-locks)
case "$tag_lock_root" in
  /*) ;;
  *) tag_lock_root="$repo_dir/$tag_lock_root" ;;
esac
mkdir -p "$tag_lock_root"
[ -d "$tag_lock_root" ] && [ ! -L "$tag_lock_root" ] || {
  printf '%s\n' 'Diretório de locks Git inválido.' >&2
  exit 1
}
tag_lock_key=$(printf '%s' "$candidate_image" | shasum -a 256 | awk '{print $1}')
if ! mkdir "$tag_lock_root/$tag_lock_key"; then
  printf '%s\n' 'Tag candidata já foi reservada por outra tentativa.' >&2
  exit 1
fi

if ! mkdir "$evidence_dir"; then
  printf '%s\n' 'Diretório de evidência já existe; sobrescrita recusada.' >&2
  exit 1
fi
if docker image inspect "$candidate_image" >/dev/null 2>&1; then
  printf '%s\n' 'Tag candidata já existe; sobrescrita recusada.' >&2
  exit 1
fi

docker build \
  --pull \
  --platform linux/amd64 \
  --provenance=false \
  --build-arg "SOURCE_REVISION=$recipe_commit" \
  --label "br.adv.maiocchi.base-commit=$base_commit" \
  --label "br.adv.maiocchi.patch-sha256=$actual_patch_sha" \
  --label "br.adv.maiocchi.recipe-commit=$recipe_commit" \
  --tag "$candidate_image" \
  "$source_dir"

candidate_image_id=$(docker image inspect --format '{{.Id}}' "$candidate_image")
printf '%s\n' "$candidate_image_id" | grep -Eq '^sha256:[0-9a-f]{64}$'
[ "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$candidate_image_id" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$candidate_image_id")" = "$candidate_version" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$candidate_image_id")" = "$recipe_commit" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.base-commit" }}' "$candidate_image_id")" = "$base_commit" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$candidate_image_id")" = "$actual_patch_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$candidate_image_id")" = "$recipe_commit" ]

printf '%s\n' "$candidate_image_id" >"$evidence_dir/portal-$candidate_version.image-id.txt"
docker image inspect "$candidate_image_id" >"$evidence_dir/portal-$candidate_version.image-inspect.json"
docker image save --output "$evidence_dir/portal-$candidate_version.docker-image.tar" "$candidate_image_id"
run_syft "$candidate_image_id" >"$evidence_dir/portal-$candidate_version.cdx.json"
candidate_image_digest=${candidate_image_id#sha256:}
jq -e \
  --arg image_digest "$candidate_image_digest" \
  --arg recipe_revision "$recipe_commit" \
  --arg syft_version "$expected_syft_version" '
    .bomFormat == "CycloneDX" and
    .metadata.component.type == "container" and
    .metadata.component.name == "sha256" and
    .metadata.component.version == $image_digest and
    (any(.metadata.tools.components[]?;
      .type == "application" and .name == "syft" and .version == $syft_version)) and
    (any(.metadata.properties[]?;
      .name == "syft:image:labels:br.adv.maiocchi.recipe-commit" and
      .value == $recipe_revision)) and
    (any(.metadata.properties[]?;
      .name == "syft:image:labels:org.opencontainers.image.revision" and
      .value == $recipe_revision))
  ' "$evidence_dir/portal-$candidate_version.cdx.json" >/dev/null

grype_db_status_before=$(run_grype db status -o json)
grype_db_checked_at_epoch=$(date -u '+%s')
jq -e \
  --argjson checked_at "$grype_db_checked_at_epoch" \
  --argjson max_age "$grype_db_max_age_seconds" '
    .valid == true and
    (.schemaVersion | test("^v6[.]")) and
    (.from | test("[?&]checksum=sha256%3A[0-9a-f]{64}(&.*)?$")) and
    (.built | fromdateiso8601) as $built_at |
    (($checked_at - $built_at) >= -300) and
    (($checked_at - $built_at) <= $max_age) and
    (.path | startswith("/"))
  ' >/dev/null <<EOF
$grype_db_status_before
EOF
grype_db_path=$(printf '%s\n' "$grype_db_status_before" | jq -er '.path')
if [ ! -f "$grype_db_path" ] || [ -L "$grype_db_path" ]; then
  printf '%s\n' 'Banco local do Grype deve ser arquivo regular, não link simbólico.' >&2
  exit 1
fi
grype_db_sha_before=$(shasum -a 256 "$grype_db_path" | awk '{print $1}')
printf '%s\n' "$grype_db_sha_before" | grep -Eq '^[0-9a-f]{64}$'

run_grype "$candidate_image_id" >"$evidence_dir/portal-$candidate_version.grype.json"
run_grype "$candidate_image_id" --fail-on high >/dev/null
grype_db_status_after=$(run_grype db status -o json)
grype_db_sha_after=$(shasum -a 256 "$grype_db_path" | awk '{print $1}')
[ "$grype_db_sha_after" = "$grype_db_sha_before" ] || {
  printf '%s\n' 'Banco do Grype mudou durante o scan raw e o gate de severidade.' >&2
  exit 1
}
jq -e -n \
  --argjson before "$grype_db_status_before" \
  --argjson after "$grype_db_status_after" \
  '$before == $after' >/dev/null
verify_scanner_binary "$syft_bin" "$expected_syft_binary_sha256" 'Binário Syft após os scans'
verify_scanner_binary "$grype_bin" "$expected_grype_binary_sha256" 'Binário Grype após os scans'

portal_grype_report="$evidence_dir/portal-$candidate_version.grype.json"
portal_grype_config="$candidate_work/portal-grype-config.json"
portal_grype_manifest="$candidate_work/portal-grype-manifest.json"
jq -ej '.source.target.config | @base64d' "$portal_grype_report" >"$portal_grype_config"
jq -ej '.source.target.manifest | @base64d' "$portal_grype_report" >"$portal_grype_manifest"
grype_config_digest=$(shasum -a 256 "$portal_grype_config" | awk '{print $1}')
grype_manifest_digest=$(shasum -a 256 "$portal_grype_manifest" | awk '{print $1}')
jq -e \
  --arg image_id "$candidate_image_id" \
  --arg config_digest "sha256:$grype_config_digest" \
  --arg manifest_digest "sha256:$grype_manifest_digest" \
  --arg recipe_revision "$recipe_commit" \
  --argjson db_status "$grype_db_status_before" '
    .source.type == "image" and
    .source.target.userInput == $image_id and
    .source.target.imageID == $config_digest and
    .source.target.manifestDigest == $manifest_digest and
    .source.target.architecture == "amd64" and
    .source.target.os == "linux" and
    .source.target.labels["br.adv.maiocchi.recipe-commit"] == $recipe_revision and
    .source.target.labels["org.opencontainers.image.revision"] == $recipe_revision and
    (has("ignoredMatches") | not) and
    all(.matches[];
      (.vulnerability.severity | type == "string") and
      (.vulnerability.severity == "Unknown" or
       .vulnerability.severity == "Negligible" or
       .vulnerability.severity == "Low" or
       .vulnerability.severity == "Medium")) and
    .descriptor.name == "grype" and
    .descriptor.version == "0.115.0" and
    .descriptor.db.status == $db_status and
    .descriptor.configuration.output == ["json"] and
    .descriptor.configuration["check-for-app-update"] == false and
    .descriptor.configuration["only-fixed"] == false and
    .descriptor.configuration["only-notfixed"] == false and
    .descriptor.configuration["ignore-wontfix"] == "" and
    .descriptor.configuration.search.scope == "squashed" and
    .descriptor.configuration.exclude == [] and
    .descriptor.configuration.externalSources.enable == false and
    .descriptor.configuration["vex-documents"] == [] and
    .descriptor.configuration["vex-add"] == [] and
    .descriptor.configuration["fail-on-severity"] == "" and
    .descriptor.configuration.db["auto-update"] == false and
    .descriptor.configuration.db["validate-by-hash-on-start"] == true and
    .descriptor.configuration.db["validate-age"] == true
  ' "$portal_grype_report" >/dev/null
jq -e \
  --arg config_digest "sha256:$grype_config_digest" '
    .schemaVersion == 2 and
    .config.digest == $config_digest and
    (.layers | type == "array" and length > 0) and
    all(.layers[];
      (.digest | test("^sha256:[0-9a-f]{64}$")) and
      (.size | type == "number" and . > 0))
  ' "$portal_grype_manifest" >/dev/null
jq -e \
  --arg recipe_revision "$recipe_commit" \
  --slurpfile report "$portal_grype_report" '
    .architecture == "amd64" and
    .os == "linux" and
    .config.Labels == $report[0].source.target.labels and
    .config.Labels["br.adv.maiocchi.recipe-commit"] == $recipe_revision and
    .config.Labels["org.opencontainers.image.revision"] == $recipe_revision
  ' "$portal_grype_config" >/dev/null

jq -n \
  --argjson syft "$syft_version_json" \
  --argjson grype "$grype_version_json" \
  --argjson grype_db "$grype_db_status_before" \
  --arg grype_db_sha256 "$grype_db_sha_before" \
  --arg syft_binary_sha256 "$expected_syft_binary_sha256" \
  --arg syft_release_archive_url "$expected_syft_release_archive_url" \
  --arg syft_release_archive_sha256 "$expected_syft_release_archive_sha256" \
  --arg grype_binary_sha256 "$expected_grype_binary_sha256" \
  --arg grype_release_archive_url "$expected_grype_release_archive_url" \
  --arg grype_release_archive_sha256 "$expected_grype_release_archive_sha256" '
    {
      schema: "maiocchi.scanner-evidence.v1",
      syft: ($syft | {
        application,
        version,
        gitCommit,
        gitDescription,
        platform,
        schemaVersion
      } + {
        binarySha256: $syft_binary_sha256,
        releaseArchive: {
          url: $syft_release_archive_url,
          sha256: $syft_release_archive_sha256
        }
      }),
      grype: ($grype | {
        application,
        version,
        gitCommit,
        gitDescription,
        platform,
        supportedDbSchema,
        syftVersion
      } + {
        binarySha256: $grype_binary_sha256,
        releaseArchive: {
          url: $grype_release_archive_url,
          sha256: $grype_release_archive_sha256
        }
      }),
      grypeDb: (($grype_db | {
        schemaVersion,
        from,
        built,
        valid
      }) + {sha256: $grype_db_sha256})
    }
  ' >"$evidence_dir/portal-$candidate_version.scan-metadata.json"
jq -e '
  (keys == ["grype", "grypeDb", "schema", "syft"]) and
  .schema == "maiocchi.scanner-evidence.v1" and
  (.syft | keys == [
    "application", "binarySha256", "gitCommit", "gitDescription", "platform",
    "releaseArchive", "schemaVersion", "version"
  ]) and
  (.grype | keys == [
    "application", "binarySha256", "gitCommit", "gitDescription", "platform",
    "releaseArchive", "supportedDbSchema", "syftVersion", "version"
  ]) and
  (.syft.releaseArchive | keys == ["sha256", "url"]) and
  (.grype.releaseArchive | keys == ["sha256", "url"]) and
  (.grypeDb | keys == ["built", "from", "schemaVersion", "sha256", "valid"]) and
  .grypeDb.valid == true and
  (.grypeDb.sha256 | test("^[0-9a-f]{64}$"))
' "$evidence_dir/portal-$candidate_version.scan-metadata.json" >/dev/null
[ "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$candidate_image_id" ]

(
  cd "$evidence_dir"
  shasum -a 256 \
    "portal-$candidate_version.image-id.txt" \
    "portal-$candidate_version.image-inspect.json" \
    "portal-$candidate_version.docker-image.tar" \
    "portal-$candidate_version.cdx.json" \
    "portal-$candidate_version.grype.json" \
    "portal-$candidate_version.scan-metadata.json" \
    >SHA256SUMS
)

printf '%s\n' "Imagem e evidência candidatas produzidas em: $evidence_dir"
