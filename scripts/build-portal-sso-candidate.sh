#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
base_commit='7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d'
portal_patch="$repo_dir/patches/portal/0001-maiocchi-sso-portal-1.15.1.patch"
expected_patch_sha='272c65dd0b932f127b53f0556fb1be814a066367a56acb613e37d1acf46b7c50'
candidate_version='1.15.1'
candidate_image="${PORTAL_SSO_CANDIDATE_IMAGE:-maiocchi/assinatura-portal:1.15.1}"
recipe_commit=$(git -C "$repo_dir" rev-parse HEAD)

git -C "$repo_dir" cat-file -e "$base_commit^{commit}"
actual_patch_sha=$(shasum -a 256 "$portal_patch" | awk '{print $1}')
[ "$actual_patch_sha" = "$expected_patch_sha" ] || {
  printf '%s\n' 'Patch do portal SSO divergiu do hash aprovado.' >&2
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

node -e '
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

source_node_bin="${PORTAL_SSO_NODE_BIN:-}"
if [ -z "$source_node_bin" ]; then
  for node_candidate in "$(command -v node 2>/dev/null || true)" /opt/homebrew/opt/node@22/bin/node; do
    [ -x "$node_candidate" ] || continue
    [ "$($node_candidate -p 'process.versions.node.split(".")[0]')" = '22' ] || continue
    source_node_bin="$node_candidate"
    break
  done
fi
[ -x "$source_node_bin" ] || {
  printf '%s\n' 'Node.js 22 não está disponível para a auditoria do snapshot.' >&2
  exit 1
}
source_node_dir=$(dirname -- "$source_node_bin")
[ -x "$source_node_dir/npm" ] || {
  printf '%s\n' 'npm correspondente ao Node.js 22 não está disponível.' >&2
  exit 1
}

(
  cd "$source_dir"
  PATH="$source_node_dir:$PATH"
  export PATH
  SHARP_IGNORE_GLOBAL_LIBVIPS=1
  export SHARP_IGNORE_GLOBAL_LIBVIPS
  NEXT_TELEMETRY_DISABLED=1
  export NEXT_TELEMETRY_DISABLED
  [ "$(node -p 'process.versions.node.split(".")[0]')" = '22' ]
  npm ci
  npm run build
  node --test tests/*.test.mjs
  npm run lint
)

if [ "${PORTAL_SSO_SOURCE_AUDIT_ONLY:-false}" = 'true' ]; then
  printf '%s\n' 'Build, testes e lint do snapshot candidato concluídos; imagem não construída.'
  exit 0
fi

for required_tool in docker syft grype; do
  command -v "$required_tool" >/dev/null 2>&1 || {
    printf '%s\n' "$required_tool não está disponível; evidência candidata não foi produzida." >&2
    exit 1
  }
done

evidence_dir="${PORTAL_SSO_EVIDENCE_DIR:-$repo_dir/artifacts/portal-sso-$candidate_version-candidate}"
[ ! -e "$evidence_dir" ] || {
  printf '%s\n' 'Diretório de evidência já existe; sobrescrita recusada.' >&2
  exit 1
}
mkdir -p "$evidence_dir"

docker build \
  --pull \
  --provenance=false \
  --build-arg "SOURCE_REVISION=$recipe_commit" \
  --label "br.adv.maiocchi.base-commit=$base_commit" \
  --label "br.adv.maiocchi.patch-sha256=$actual_patch_sha" \
  --label "br.adv.maiocchi.recipe-commit=$recipe_commit" \
  --tag "$candidate_image" \
  "$source_dir"

[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$candidate_image")" = "$candidate_version" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$candidate_image")" = "$recipe_commit" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.base-commit" }}' "$candidate_image")" = "$base_commit" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$candidate_image")" = "$actual_patch_sha" ]
[ "$(docker image inspect --format '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$candidate_image")" = "$recipe_commit" ]

docker image inspect "$candidate_image" >"$evidence_dir/portal-$candidate_version.image-inspect.json"
docker image save --output "$evidence_dir/portal-$candidate_version.docker-image.tar" "$candidate_image"
syft "$candidate_image" -o cyclonedx-json >"$evidence_dir/portal-$candidate_version.cdx.json"
grype "$candidate_image" -o json >"$evidence_dir/portal-$candidate_version.grype.json"
grype "$candidate_image" --fail-on high >/dev/null

(
  cd "$evidence_dir"
  shasum -a 256 \
    "portal-$candidate_version.image-inspect.json" \
    "portal-$candidate_version.docker-image.tar" \
    "portal-$candidate_version.cdx.json" \
    "portal-$candidate_version.grype.json" \
    >SHA256SUMS
)

printf '%s\n' "Imagem e evidência candidatas produzidas em: $evidence_dir"
