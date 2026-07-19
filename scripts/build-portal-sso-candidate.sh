#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
base_commit='7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d'
portal_patch="$repo_dir/patches/portal/0001-maiocchi-sso-portal-1.15.1.patch"
expected_patch_sha='d088a5a8fdcde66e12ab747dad9a4477de39513f168dbb61bad264a92e19be66'
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
  PATH="$source_node_dir:$PATH"
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

for required_tool in docker syft grype; do
  command -v "$required_tool" >/dev/null 2>&1 || {
    printf '%s\n' "$required_tool não está disponível; evidência candidata não foi produzida." >&2
    exit 1
  }
done

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
syft "$candidate_image_id" --from docker -o cyclonedx-json >"$evidence_dir/portal-$candidate_version.cdx.json"
grype "$candidate_image_id" --from docker -o json >"$evidence_dir/portal-$candidate_version.grype.json"
grype "$candidate_image_id" --from docker --fail-on high >/dev/null
[ "$(docker image inspect --format '{{.Id}}' "$candidate_image")" = "$candidate_image_id" ]

(
  cd "$evidence_dir"
  shasum -a 256 \
    "portal-$candidate_version.image-id.txt" \
    "portal-$candidate_version.image-inspect.json" \
    "portal-$candidate_version.docker-image.tar" \
    "portal-$candidate_version.cdx.json" \
    "portal-$candidate_version.grype.json" \
    >SHA256SUMS
)

printf '%s\n' "Imagem e evidência candidatas produzidas em: $evidence_dir"
