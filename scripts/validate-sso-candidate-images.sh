#!/bin/sh
set -eu

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)

portal_version='1.15.1'
portal_base_commit='7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d'
portal_patch="$repo_dir/patches/portal/0001-maiocchi-sso-portal-1.15.1.patch"

docuseal_version='3.0.1-maiocchi.15'
docuseal_base_archive="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
docuseal_base_sha256='e8f3b6e8ba3a8e70c7ea66846b57f6c0bddcd582be87bd4ae3ee074c2f9ff26c'
docuseal_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
docuseal_build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"
docuseal_build_inputs_sha256='0e36b9a594e3da75f64c3c37909be5fa9f57e3eefeeed2d21d993590496a5987'
docuseal_native_security_patch="$repo_dir/patches/docuseal/0011-update-native-image-libraries.patch"
docuseal_native_security_patch_sha256='83250e4672db3a4256d7ec44f04f621ef7c1ee178718d9831948f9261580c30c'
docuseal_tiff_source="$repo_dir/compliance/sources/tiff-4.7.2.tar.gz"
docuseal_tiff_source_sha256='672bd7d10aee4606171afb864f3570b83340f6a33e2c186dc0512f7145ffdf6a'
docuseal_tiff_apkbuild_sha256='f7b0bdc5ae7c8340960afaeed18a1e1e09089a8ec99c2ac0335df70c4f046985'
docuseal_tiff_version='4.7.2-r0'
docuseal_openexr_version='3.4.13-r0'
docuseal_ruby_base_digest='sha256:f48938e9ae72a4d32e728b03c306e7a7ff21f0cb6c2ed33f44a078c700b2aea6'
syft_binary_sha256='574df1a0862ff88ad933be214e81069e35b17618a13e019f8f1c84fe063222a2'
syft_release_archive_url='https://github.com/anchore/syft/releases/download/v1.46.0/syft_1.46.0_linux_amd64.tar.gz'
syft_release_archive_sha256='d654f678b709eb53c393d38519d5ed7d2e57205529404018614cfefa0fb2b5ca'
grype_binary_sha256='05ffd2c28a607e48fb2269d9aac5b3d53e8a51bbac501946644745eae2119907'
grype_release_archive_url='https://github.com/anchore/grype/releases/download/v0.115.0/grype_0.115.0_linux_amd64.tar.gz'
grype_release_archive_sha256='3fad92940650e514c0aa2dad83526942a055e210cec09a8a59d9c024adc2b90e'

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

file_size() {
  wc -c <"$1" | awk '{print $1}'
}

require_regular_file() {
  required_file=$1
  required_description=$2

  [ -f "$required_file" ] && [ ! -L "$required_file" ] || fail "$required_description ausente ou simbólico."
}

read_image_id() {
  evidence_dir=$1
  evidence_name=$2
  evidence_label=$3

  [ -n "$evidence_dir" ] || fail "$evidence_label: diretório de evidência obrigatório."
  [ "${evidence_dir#/}" != "$evidence_dir" ] || fail "$evidence_label: diretório de evidência deve ser absoluto."
  [ -d "$evidence_dir" ] && [ ! -L "$evidence_dir" ] || fail "$evidence_label: diretório de evidência ausente ou simbólico."

  evidence_file="$evidence_dir/$evidence_name"
  [ -f "$evidence_file" ] && [ ! -L "$evidence_file" ] || fail "$evidence_label: arquivo de image ID ausente ou simbólico."
  evidence_size=$(wc -c <"$evidence_file" | awk '{print $1}')
  [ "$evidence_size" -eq 72 ] || fail "$evidence_label: arquivo de image ID deve conter exatamente um ID e newline."

  image_id=$(sed -n '1p' "$evidence_file")
  printf '%s\n' "$image_id" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail "$evidence_label: image ID inválido."
  printf '%s\n' "$image_id"
}

validate_evidence_set() {
  evidence_dir=$1
  evidence_label=$2
  shift 2

  [ -n "$evidence_dir" ] || fail "$evidence_label: diretório de evidência obrigatório."
  [ "${evidence_dir#/}" != "$evidence_dir" ] || fail "$evidence_label: diretório de evidência deve ser absoluto."
  [ -d "$evidence_dir" ] && [ ! -L "$evidence_dir" ] || fail "$evidence_label: diretório de evidência ausente ou simbólico."

  evidence_manifest="$evidence_dir/SHA256SUMS"
  [ -f "$evidence_manifest" ] && [ ! -L "$evidence_manifest" ] || fail "$evidence_label: manifesto SHA256SUMS ausente ou simbólico."

  expected_directory_names=$(printf '%s\n' SHA256SUMS "$@" | LC_ALL=C sort)
  actual_directory_names=$(
    find "$evidence_dir" ! -path "$evidence_dir" -prune -exec basename {} \; | LC_ALL=C sort
  )
  [ "$actual_directory_names" = "$expected_directory_names" ] || fail "$evidence_label: diretório contém arquivos fora do conjunto fechado de evidências."

  manifest_line_count=$(wc -l <"$evidence_manifest" | awk '{print $1}')
  [ "$manifest_line_count" -eq "$#" ] || fail "$evidence_label: manifesto não contém o conjunto fechado de evidências."

  manifest_names=$(LC_ALL=C awk '
    NF != 2 || length($1) != 64 || $1 !~ /^[0-9a-f]+$/ { invalid = 1; next }
    { print $2 }
    END { if (invalid) exit 1 }
  ' "$evidence_manifest") || fail "$evidence_label: formato do manifesto SHA256SUMS é inválido."
  actual_names=$(printf '%s\n' "$manifest_names" | LC_ALL=C sort)
  expected_names=$(printf '%s\n' "$@" | LC_ALL=C sort)
  [ "$actual_names" = "$expected_names" ] || fail "$evidence_label: manifesto referencia arquivos inesperados ou omite evidências."

  for evidence_name in "$@"; do
    evidence_file="$evidence_dir/$evidence_name"
    [ -f "$evidence_file" ] && [ ! -L "$evidence_file" ] || fail "$evidence_label: artefato de evidência ausente ou simbólico."
  done

  (
    CDPATH='' cd -- "$evidence_dir"
    shasum -a 256 -c SHA256SUMS >/dev/null
  ) || fail "$evidence_label: verificação do manifesto SHA256SUMS falhou."
}

validate_image_archive_and_inspect() (
  archive_file=$1
  inspect_file=$2
  image_id=$3
  evidence_label=$4
  image_digest=${image_id#sha256:}
  archive_tmp=$(mktemp -d "${TMPDIR:-/tmp}/maiocchi-image-archive.XXXXXX") || fail "$evidence_label: não foi possível criar diretório temporário."
  trap 'rm -rf "$archive_tmp"' EXIT HUP INT TERM

  require_regular_file "$archive_file" "$evidence_label: archive Docker"
  require_regular_file "$inspect_file" "$evidence_label: inspect JSON"

  tar -tf "$archive_file" >"$archive_tmp/entries.txt" || fail "$evidence_label: archive Docker ilegível."
  awk -F/ '
    /^\// || /\\/ || /\/\// { invalid = 1 }
    $0 !~ /^(blobs\/|blobs\/sha256\/|blobs\/sha256\/[0-9a-f]{64}|index[.]json|manifest[.]json|oci-layout)$/ { invalid = 1 }
    {
      for (field_number = 1; field_number <= NF; field_number += 1) {
        if ($field_number == "..") invalid = 1
      }
    }
    END { exit invalid ? 1 : 0 }
  ' "$archive_tmp/entries.txt" || fail "$evidence_label: archive Docker contém caminho inseguro."
  [ "$(LC_ALL=C sort "$archive_tmp/entries.txt" | uniq -d | wc -l | awk '{print $1}')" -eq 0 ] || fail "$evidence_label: archive Docker contém entradas duplicadas."
  archive_types=$(tar -tvf "$archive_file" | cut -c1 | LC_ALL=C sort -u | tr -d '\n') || fail "$evidence_label: tipos do archive Docker não puderam ser auditados."
  [ "$archive_types" = '-d' ] || fail "$evidence_label: archive Docker contém link, dispositivo ou outro tipo não regular."

  tar -xf "$archive_file" -C "$archive_tmp" || fail "$evidence_label: archive Docker não pôde ser extraído."
  for archive_metadata in index.json manifest.json oci-layout; do
    require_regular_file "$archive_tmp/$archive_metadata" "$evidence_label: $archive_metadata no archive"
  done

  jq -e '
    .imageLayoutVersion == "1.0.0" and
    (keys | sort) == ["imageLayoutVersion"]
  ' "$archive_tmp/oci-layout" >/dev/null || fail "$evidence_label: oci-layout inválido."

  index_descriptor=$(jq -er \
    --arg image_id "$image_id" '
      if (
        .schemaVersion == 2 and
        .mediaType == "application/vnd.oci.image.index.v1+json" and
        (.manifests | type == "array" and length == 1) and
        .manifests[0].mediaType == "application/vnd.docker.distribution.manifest.v2+json" and
        .manifests[0].digest == $image_id and
        (.manifests[0].size | type == "number" and . > 0) and
        (.manifests[0].annotations | type == "object") and
        (.manifests[0].annotations["config.digest"] | type == "string")
      ) then
        [
          .manifests[0].digest,
          (.manifests[0].size | tostring),
          .manifests[0].annotations["config.digest"]
        ] | @tsv
      else
        error("invalid index")
      end
    ' "$archive_tmp/index.json") || fail "$evidence_label: index OCI não referencia exclusivamente o image ID candidato."
  index_manifest_digest=$(printf '%s\n' "$index_descriptor" | awk -F '\t' '{print $1}')
  index_manifest_size=$(printf '%s\n' "$index_descriptor" | awk -F '\t' '{print $2}')
  index_config_digest=$(printf '%s\n' "$index_descriptor" | awk -F '\t' '{print $3}')
  printf '%s\n' "$index_config_digest" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail "$evidence_label: digest de config na anotação OCI é inválido."
  [ "$index_manifest_digest" = "$image_id" ] || fail "$evidence_label: digest do index OCI diverge do image ID."

  manifest_blob="$archive_tmp/blobs/sha256/$image_digest"
  require_regular_file "$manifest_blob" "$evidence_label: blob do manifesto candidato"
  [ "$(sha256_file "$manifest_blob")" = "$image_digest" ] || fail "$evidence_label: hash do blob de manifesto diverge do image ID."
  [ "$(file_size "$manifest_blob")" -eq "$index_manifest_size" ] || fail "$evidence_label: tamanho do blob de manifesto diverge do index OCI."

  manifest_descriptor=$(jq -er '
    if (
      .schemaVersion == 2 and
      .mediaType == "application/vnd.docker.distribution.manifest.v2+json" and
      .config.mediaType == "application/vnd.docker.container.image.v1+json" and
      (.config.digest | type == "string") and
      (.config.size | type == "number" and . > 0) and
      (.layers | type == "array" and length > 0) and
      all(.layers[];
        .mediaType == "application/vnd.docker.image.rootfs.diff.tar.gzip" and
        (.digest | type == "string") and
        (.size | type == "number" and . > 0)
      )
    ) then
      [.config.digest, (.config.size | tostring), .mediaType] | @tsv
    else
      error("invalid manifest")
    end
  ' "$manifest_blob") || fail "$evidence_label: manifesto Docker inválido."
  config_digest=$(printf '%s\n' "$manifest_descriptor" | awk -F '\t' '{print $1}')
  config_size=$(printf '%s\n' "$manifest_descriptor" | awk -F '\t' '{print $2}')
  manifest_media_type=$(printf '%s\n' "$manifest_descriptor" | awk -F '\t' '{print $3}')
  printf '%s\n' "$config_digest" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail "$evidence_label: digest de config do manifesto é inválido."
  [ "$config_digest" = "$index_config_digest" ] || fail "$evidence_label: config do manifesto diverge da anotação do index OCI."

  config_hex=${config_digest#sha256:}
  config_path="blobs/sha256/$config_hex"
  config_blob="$archive_tmp/$config_path"
  require_regular_file "$config_blob" "$evidence_label: blob de config"
  [ "$(sha256_file "$config_blob")" = "$config_hex" ] || fail "$evidence_label: hash do blob de config diverge do manifesto."
  [ "$(file_size "$config_blob")" -eq "$config_size" ] || fail "$evidence_label: tamanho do blob de config diverge do manifesto."

  jq -e '
    .architecture == "amd64" and
    .os == "linux" and
    (.config | type == "object") and
    (.config.Labels | type == "object") and
    .rootfs.type == "layers" and
    (.rootfs.diff_ids | type == "array" and length > 0) and
    all(.rootfs.diff_ids[]; test("^sha256:[0-9a-f]{64}$"))
  ' "$config_blob" >/dev/null || fail "$evidence_label: config Docker não é linux/amd64 ou está estruturalmente inválida."
  manifest_layer_count=$(jq -er '.layers | length' "$manifest_blob")
  config_diff_id_count=$(jq -er '.rootfs.diff_ids | length' "$config_blob")
  [ "$manifest_layer_count" -eq "$config_diff_id_count" ] || fail "$evidence_label: número de camadas do manifesto diverge dos diff IDs da config."
  archive_layer_projection_sha256=$(
    jq -c '[.layers[] | {mediaType, size}]' "$manifest_blob" | shasum -a 256 | awk '{print $1}'
  )
  printf '%s\n' "$archive_layer_projection_sha256" | grep -Eq '^[0-9a-f]{64}$' || fail "$evidence_label: projeção de camadas do archive é inválida."

  jq -e \
    --arg config_path "$config_path" \
    --slurpfile docker_manifest "$manifest_blob" '
      . as $legacy |
      $docker_manifest[0] as $manifest |
      ($manifest.layers | map("blobs/sha256/" + (.digest | sub("^sha256:"; "")))) as $layer_paths |
      ($legacy | type == "array" and length == 1) and
      $legacy[0].Config == $config_path and
      ($legacy[0].RepoTags == null or
        ($legacy[0].RepoTags | type == "array" and all(.[]; type == "string"))) and
      $legacy[0].Layers == $layer_paths
    ' "$archive_tmp/manifest.json" >/dev/null || fail "$evidence_label: manifest.json não referencia a mesma config e as mesmas camadas."

  expected_archive_entries=$(
    {
      printf '%s\n' \
        'blobs/' \
        'blobs/sha256/' \
        "blobs/sha256/$image_digest" \
        "$config_path" \
        'index.json' \
        'manifest.json' \
        'oci-layout'
      jq -r '.layers[].digest | "blobs/sha256/" + sub("^sha256:"; "")' "$manifest_blob"
    } | LC_ALL=C sort -u
  )
  actual_archive_entries=$(LC_ALL=C sort "$archive_tmp/entries.txt")
  [ "$actual_archive_entries" = "$expected_archive_entries" ] || fail "$evidence_label: archive Docker contém blobs ou entradas fora do conjunto fechado referenciado."

  jq -r '.layers[] | [.digest, (.size | tostring)] | @tsv' "$manifest_blob" |
  while IFS="$(printf '\t')" read -r layer_digest layer_size; do
    printf '%s\n' "$layer_digest" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail "$evidence_label: digest de camada inválido."
    layer_hex=${layer_digest#sha256:}
    layer_blob="$archive_tmp/blobs/sha256/$layer_hex"
    require_regular_file "$layer_blob" "$evidence_label: blob de camada"
    [ "$(sha256_file "$layer_blob")" = "$layer_hex" ] || fail "$evidence_label: hash de camada diverge do manifesto."
    [ "$(file_size "$layer_blob")" -eq "$layer_size" ] || fail "$evidence_label: tamanho de camada diverge do manifesto."
  done

  jq -e \
    --arg image_id "$image_id" \
    --slurpfile config "$config_blob" '
      . as $inspect |
      $config[0] as $archive_config |
      ($inspect | type == "array" and length == 1) and
      $inspect[0].Id == $image_id and
      $inspect[0].Architecture == $archive_config.architecture and
      $inspect[0].Os == $archive_config.os and
      $inspect[0].Config.Labels == $archive_config.config.Labels and
      $inspect[0].Config.Env == $archive_config.config.Env and
      $inspect[0].Config.Entrypoint == $archive_config.config.Entrypoint and
      $inspect[0].Config.Cmd == $archive_config.config.Cmd and
      $inspect[0].Config.User == $archive_config.config.User and
      $inspect[0].Config.WorkingDir == $archive_config.config.WorkingDir and
      $inspect[0].RootFS.Type == $archive_config.rootfs.type and
      $inspect[0].RootFS.Layers == $archive_config.rootfs.diff_ids
    ' "$inspect_file" >/dev/null || fail "$evidence_label: inspect JSON não corresponde ao image ID e à config do archive."

  printf '%s\t%s\t%s\n' "$config_digest" "$manifest_media_type" "$archive_layer_projection_sha256"
)

validate_sbom_binding() {
  sbom_file=$1
  image_id=$2
  recipe_revision=$3
  evidence_label=$4
  image_digest=${image_id#sha256:}

  require_regular_file "$sbom_file" "$evidence_label: SBOM"
  jq -e \
    --arg image_digest "$image_digest" \
    --arg recipe_revision "$recipe_revision" '
      .bomFormat == "CycloneDX" and
      .specVersion == "1.7" and
      (.version | type == "number" and . >= 1) and
      (.components | type == "array") and
      .metadata.component.type == "container" and
      .metadata.component.name == "sha256" and
      .metadata.component.version == $image_digest and
      ([.metadata.tools.components[]? |
        select(.type == "application" and .name == "syft" and .version == "1.46.0")
      ] | length == 1) and
      ([.metadata.properties[]? |
        select(.name == "syft:image:labels:br.adv.maiocchi.recipe-commit" and .value == $recipe_revision)
      ] | length == 1) and
      ([.metadata.properties[]? |
        select(.name == "syft:image:labels:org.opencontainers.image.revision" and .value == $recipe_revision)
      ] | length == 1)
    ' "$sbom_file" >/dev/null || fail "$evidence_label: SBOM não está ligado ao image ID, Syft e commit da receita aprovados."
}

validate_scan_metadata() {
  metadata_file=$1
  raw_grype_file=$2
  filtered_grype_file=$3
  evidence_label=$4

  require_regular_file "$metadata_file" "$evidence_label: metadata dos scanners"
  jq -e \
    --arg syft_binary_sha256 "$syft_binary_sha256" \
    --arg syft_release_archive_url "$syft_release_archive_url" \
    --arg syft_release_archive_sha256 "$syft_release_archive_sha256" \
    --arg grype_binary_sha256 "$grype_binary_sha256" \
    --arg grype_release_archive_url "$grype_release_archive_url" \
    --arg grype_release_archive_sha256 "$grype_release_archive_sha256" '
    .schema == "maiocchi.scanner-evidence.v1" and
    .syft == {
      application: "syft",
      binarySha256: $syft_binary_sha256,
      version: "1.46.0",
      gitCommit: "b15c5dbfe2bb21c9d73002c1056a829c8c411c75",
      gitDescription: "v1.46.0",
      platform: "linux/amd64",
      releaseArchive: {
        url: $syft_release_archive_url,
        sha256: $syft_release_archive_sha256
      },
      schemaVersion: "16.1.5"
    } and
    .grype == {
      application: "grype",
      binarySha256: $grype_binary_sha256,
      version: "0.115.0",
      gitCommit: "fa8b7e2a528cf1f8b098123f256c61db9e5df69c",
      gitDescription: "v0.115.0",
      platform: "linux/amd64",
      releaseArchive: {
        url: $grype_release_archive_url,
        sha256: $grype_release_archive_sha256
      },
      supportedDbSchema: 6,
      syftVersion: "v1.46.0"
    } and
    (.grypeDb | keys | sort) == ["built", "from", "schemaVersion", "sha256", "valid"] and
    .grypeDb.valid == true and
    (.grypeDb.schemaVersion | test("^v6[.][0-9]+[.][0-9]+$")) and
    (.grypeDb.from | test("^https://grype[.]anchore[.]io/databases/v6/.+[?]checksum=sha256%3A[0-9a-f]{64}$")) and
    (.grypeDb.built | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T")) and
    (.grypeDb.sha256 | test("^[0-9a-f]{64}$"))
  ' "$metadata_file" >/dev/null || fail "$evidence_label: metadata dos scanners diverge dos binários oficiais ou do schema aprovado."

  if [ "$filtered_grype_file" = '-' ]; then
    jq -e -s '
      def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
      (.[0].grypeDb.built | epoch) as $built_at |
      (.[1].descriptor.timestamp | epoch) as $raw_at |
      (.[0].grypeDb | del(.sha256)) == (.[1].descriptor.db.status | {schemaVersion, from, built, valid}) and
      (($raw_at - $built_at) >= -300) and
      (($raw_at - $built_at) <= 86400)
    ' "$metadata_file" "$raw_grype_file" >/dev/null || fail "$evidence_label: metadata e DB Grype divergem."
  else
    jq -e -s '
      def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
      (.[0].grypeDb.built | epoch) as $built_at |
      (.[1].descriptor.timestamp | epoch) as $raw_at |
      (.[2].descriptor.timestamp | epoch) as $filtered_at |
      (.[0].grypeDb | del(.sha256)) == (.[1].descriptor.db.status | {schemaVersion, from, built, valid}) and
      (.[0].grypeDb | del(.sha256)) == (.[2].descriptor.db.status | {schemaVersion, from, built, valid}) and
      .[1].descriptor.db == .[2].descriptor.db and
      (($raw_at - $built_at) >= -300) and
      (($raw_at - $built_at) <= 86400) and
      ($filtered_at >= $raw_at) and
      (($filtered_at - $raw_at) <= 3600)
    ' "$metadata_file" "$raw_grype_file" "$filtered_grype_file" >/dev/null || fail "$evidence_label: metadata, DB raw e DB filtrado do Grype divergem."
  fi
}

validate_grype_binding() (
  grype_file=$1
  image_id=$2
  config_digest=$3
  manifest_media_type=$4
  archive_layer_projection_sha256=$5
  recipe_revision=$6
  report_kind=$7
  evidence_label=$8
  grype_tmp=$(mktemp -d "${TMPDIR:-/tmp}/maiocchi-grype.XXXXXX") || fail "$evidence_label: não foi possível criar diretório temporário Grype."
  trap 'rm -rf "$grype_tmp"' EXIT HUP INT TERM

  require_regular_file "$grype_file" "$evidence_label: relatório Grype $report_kind"
  jq -ej '.source.target.config | @base64d' "$grype_file" >"$grype_tmp/config.json" || fail "$evidence_label: config embutida no Grype é inválida."
  jq -ej '.source.target.manifest | @base64d' "$grype_file" >"$grype_tmp/manifest.json" || fail "$evidence_label: manifesto embutido no Grype é inválido."

  config_hex=${config_digest#sha256:}
  [ "$(sha256_file "$grype_tmp/config.json")" = "$config_hex" ] || fail "$evidence_label: config Grype diverge do config digest do archive."
  embedded_manifest_digest=$(sha256_file "$grype_tmp/manifest.json")
  embedded_layer_projection_sha256=$(
    jq -c '[.layers[] | {mediaType, size}]' "$grype_tmp/manifest.json" | shasum -a 256 | awk '{print $1}'
  )
  [ "$embedded_layer_projection_sha256" = "$archive_layer_projection_sha256" ] || fail "$evidence_label: ordem, media type ou tamanho das camadas Grype diverge do archive."
  embedded_layer_count=$(jq -er '.layers | length' "$grype_tmp/manifest.json")
  embedded_diff_id_count=$(jq -er '.rootfs.diff_ids | length' "$grype_tmp/config.json")
  [ "$embedded_layer_count" -eq "$embedded_diff_id_count" ] || fail "$evidence_label: número de camadas Grype diverge dos diff IDs da config imutável."

  jq -e \
    --arg image_id "$image_id" \
    --arg config_digest "$config_digest" \
    --arg manifest_digest "sha256:$embedded_manifest_digest" \
    --arg manifest_media_type "$manifest_media_type" \
    --arg recipe_revision "$recipe_revision" \
    --arg report_kind "$report_kind" '
      def default_kernel_ignores:
        all(.[];
          (keys | sort) == ([
            "fix-state", "include-aliases", "match-type", "namespace", "package",
            "reason", "vex-justification", "vex-status", "vulnerability"
          ] | sort) and
          (.package | keys | sort) == ([
            "language", "location", "name", "type", "upstream-name", "version"
          ] | sort)) and
        (map({
            vulnerability,
            include_aliases: .["include-aliases"],
            reason,
            namespace,
            fix_state: .["fix-state"],
            package,
            vex_status: .["vex-status"],
            vex_justification: .["vex-justification"],
            match_type: .["match-type"]
          }) == [
            {vulnerability:"",include_aliases:false,reason:"",namespace:"",fix_state:"",package:{name:"kernel-headers",version:"",language:"",type:"rpm",location:"","upstream-name":"kernel"},vex_status:"",vex_justification:"",match_type:"exact-indirect-match"},
            {vulnerability:"",include_aliases:false,reason:"",namespace:"",fix_state:"",package:{name:"linux(-.*)?-headers-.*",version:"",language:"",type:"deb",location:"","upstream-name":"linux.*"},vex_status:"",vex_justification:"",match_type:"exact-indirect-match"},
            {vulnerability:"",include_aliases:false,reason:"",namespace:"",fix_state:"",package:{name:"linux-libc-dev",version:"",language:"",type:"deb",location:"","upstream-name":"linux"},vex_status:"",vex_justification:"",match_type:"exact-indirect-match"},
            {vulnerability:"",include_aliases:false,reason:"",namespace:"",fix_state:"",package:{name:"linux-kbuild-.*",version:"",language:"",type:"deb",location:"","upstream-name":"linux.*"},vex_status:"",vex_justification:"",match_type:"exact-indirect-match"}
          ]);
      def secure_configuration:
        (keys | sort) == ([
          "SortBy", "add-cpes-if-none", "alerts", "by-cve", "check-for-app-update",
          "db", "default-image-pull-source", "dev", "distro", "exclude", "exp",
          "externalSources", "fail-on-severity", "file", "fix-channel", "from",
          "ignore", "ignore-wontfix", "match", "match-upstream-kernel-headers", "name",
          "only-fixed", "only-notfixed", "output", "output-template-file", "platform",
          "pretty", "registry", "search", "show-suppressed", "timestamp", "vex-add",
          "vex-documents"
        ] | sort) and
        .output == ["json"] and
        .file == "" and
        .pretty == false and
        .distro == "" and
        .["add-cpes-if-none"] == false and
        .["output-template-file"] == "" and
        .["check-for-app-update"] == false and
        .["only-fixed"] == false and
        .["only-notfixed"] == false and
        .["ignore-wontfix"] == "" and
        .platform == "" and
        .search == {scope:"squashed","unindexed-archives":false,"indexed-archives":true} and
        (.ignore | default_kernel_ignores) and
        .exclude == [] and
        .externalSources == {
          enable:false,
          maven:{searchUpstreamBySha1:true,baseUrl:"https://search.maven.org/solrsearch/select",rateLimit:300000000}
        } and
        .match == {
          java:{"using-cpes":false},
          jvm:{"using-cpes":true},
          dotnet:{"using-cpes":false},
          golang:{"using-cpes":false,"always-use-cpe-for-stdlib":false,"allow-main-module-pseudo-version-comparison":false},
          javascript:{"using-cpes":false},
          python:{"using-cpes":false},
          ruby:{"using-cpes":false},
          rust:{"using-cpes":false},
          hex:{"using-cpes":false},
          stock:{"using-cpes":true},
          dpkg:{"using-cpes":false,"missing-epoch-strategy":"zero","use-cpes-for-eol":false},
          rpm:{"using-cpes":false,"missing-epoch-strategy":"auto","use-cpes-for-eol":false}
        } and
        .registry == {"insecure-skip-tls-verify":false,"insecure-use-http":false,"ca-cert":""} and
        .from == ["docker"] and
        .["show-suppressed"] == false and
        .["by-cve"] == false and
        .SortBy == {"sort-by":"risk"} and
        .name == "" and
        .["default-image-pull-source"] == "" and
        .["match-upstream-kernel-headers"] == false and
        .["fix-channel"] == {"redhat-eus":{apply:"auto",versions:">= 8.0"}} and
        .timestamp == true and
        .alerts == {"enable-eol-distro-warnings":true} and
        .exp == {} and
        .dev == {db:{debug:false}} and
        (.db | keys | sort) == ([
          "auto-update", "ca-cert", "cache-dir", "max-allowed-built-age",
          "max-update-check-frequency", "require-update-check", "update-available-timeout",
          "update-download-timeout", "update-url", "validate-age", "validate-by-hash-on-start"
        ] | sort) and
        (.db["cache-dir"] | startswith("/")) and
        .db["update-url"] == "https://grype.anchore.io/databases" and
        .db["ca-cert"] == "" and
        .db["auto-update"] == false and
        .db["validate-by-hash-on-start"] == true and
        .db["validate-age"] == true and
        .db["max-allowed-built-age"] == 86400000000000 and
        .db["require-update-check"] == false and
        .db["update-available-timeout"] == 30000000000 and
        .db["update-download-timeout"] == 300000000000 and
        .db["max-update-check-frequency"] == 7200000000000;
      def valid_db:
        .status.valid == true and
        (.status.schemaVersion | test("^v6[.][0-9]+[.][0-9]+$")) and
        (.status.from | test("^https://grype[.]anchore[.]io/databases/v6/.+[?]checksum=sha256%3A[0-9a-f]{64}$")) and
        (.status.built | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T"));

      .source.type == "image" and
      .source.target.userInput == $image_id and
      .source.target.imageID == $config_digest and
      .source.target.manifestDigest == $manifest_digest and
      .source.target.mediaType == $manifest_media_type and
      .source.target.architecture == "amd64" and
      .source.target.os == "linux" and
      .source.target.labels["br.adv.maiocchi.recipe-commit"] == $recipe_revision and
      .source.target.labels["org.opencontainers.image.revision"] == $recipe_revision and
      .descriptor.name == "grype" and
      .descriptor.version == "0.115.0" and
      (.descriptor.timestamp | type == "string") and
      (try (.descriptor.timestamp | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) catch false) and
      (.descriptor.configuration | secure_configuration) and
      (.descriptor.db | valid_db) and
      (.matches | type == "array") and
      (if $report_kind == "raw" then
        (has("ignoredMatches") | not) and
        .descriptor.configuration["vex-documents"] == [] and
        .descriptor.configuration["vex-add"] == [] and
        .descriptor.configuration["fail-on-severity"] == ""
      else
        (.ignoredMatches | type == "array") and
        (.descriptor.configuration["vex-documents"] | type == "array" and length == 1) and
        (.descriptor.configuration["vex-documents"][0] | endswith("docuseal-3.0.1-maiocchi.15.openvex.json")) and
        .descriptor.configuration["vex-add"] == [] and
        .descriptor.configuration["fail-on-severity"] == "high"
      end)
    ' "$grype_file" >/dev/null || fail "$evidence_label: relatório Grype $report_kind diverge do image ID, config, commit ou política hermética."

  jq -e \
    --arg config_digest "$config_digest" \
    --arg manifest_media_type "$manifest_media_type" '
      .schemaVersion == 2 and
      .mediaType == $manifest_media_type and
      .config.digest == $config_digest and
      (.layers | type == "array" and length > 0) and
      all(.layers[]; (.digest | test("^sha256:[0-9a-f]{64}$")) and (.size | type == "number" and . > 0))
    ' "$grype_tmp/manifest.json" >/dev/null || fail "$evidence_label: manifesto embutido no Grype não referencia a config do archive."
  jq -e \
    --arg recipe_revision "$recipe_revision" \
    --slurpfile report "$grype_file" '
      .architecture == "amd64" and
      .os == "linux" and
      .config.Labels == $report[0].source.target.labels and
      .config.Labels["br.adv.maiocchi.recipe-commit"] == $recipe_revision and
      .config.Labels["org.opencontainers.image.revision"] == $recipe_revision
    ' "$grype_tmp/config.json" >/dev/null || fail "$evidence_label: config e labels embutidas no Grype divergem."
)

validate_semantic_evidence_set() {
  evidence_label=$1
  image_id=$2
  inspect_file=$3
  archive_file=$4
  sbom_file=$5
  raw_grype_file=$6
  filtered_grype_file=$7
  scanner_metadata_file=$8
  recipe_revision=$9
  expected_runtime_user=${10}

  archive_binding=$(validate_image_archive_and_inspect "$archive_file" "$inspect_file" "$image_id" "$evidence_label") || exit 1
  config_digest=$(printf '%s\n' "$archive_binding" | awk -F '\t' '{print $1}')
  manifest_media_type=$(printf '%s\n' "$archive_binding" | awk -F '\t' '{print $2}')
  archive_layer_projection_sha256=$(printf '%s\n' "$archive_binding" | awk -F '\t' '{print $3}')
  printf '%s\n' "$config_digest" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail "$evidence_label: config digest derivado do archive é inválido."
  printf '%s\n' "$archive_layer_projection_sha256" | grep -Eq '^[0-9a-f]{64}$' || fail "$evidence_label: projeção de camadas derivada do archive é inválida."

  validate_sbom_binding "$sbom_file" "$image_id" "$recipe_revision" "$evidence_label"
  validate_grype_binding "$raw_grype_file" "$image_id" "$config_digest" "$manifest_media_type" "$archive_layer_projection_sha256" "$recipe_revision" raw "$evidence_label"
  if [ "$filtered_grype_file" = '-' ]; then
    jq -e '
      (.matches | type == "array") and
      all(.matches[];
        (.vulnerability.severity | type == "string") and
        (.vulnerability.severity == "Unknown" or
         .vulnerability.severity == "Negligible" or
         .vulnerability.severity == "Low" or
         .vulnerability.severity == "Medium"))
    ' "$raw_grype_file" >/dev/null || fail "$evidence_label: allowlist fechada de severidades do Portal foi violada."
  else
    validate_grype_binding "$filtered_grype_file" "$image_id" "$config_digest" "$manifest_media_type" "$archive_layer_projection_sha256" "$recipe_revision" filtered "$evidence_label"
  fi
  if [ "$expected_runtime_user" != '-' ]; then
    jq -e --arg expected_runtime_user "$expected_runtime_user" '
      type == "array" and length == 1 and
      .[0].Config.User == $expected_runtime_user
    ' "$inspect_file" >/dev/null || fail "$evidence_label: usuário runtime diverge do contrato não-root."
  fi
  validate_scan_metadata "$scanner_metadata_file" "$raw_grype_file" "$filtered_grype_file" "$evidence_label"
}

validate_docuseal_sbom() {
  sbom_file=$1
  image_id=$2
  image_digest=${image_id#sha256:}

  jq -e \
    --arg image_digest "$image_digest" \
    --arg tiff_version "$docuseal_tiff_version" \
    --arg openexr_version "$docuseal_openexr_version" '
      def exact_apk($name; $version):
        [.components[]? | select(.name == $name)] as $components |
        ($components | length) == 1 and
        $components[0].version == $version and
        ($components[0].purl | type == "string" and startswith("pkg:apk/"));

      .metadata.component.type == "container" and
      .metadata.component.name == "sha256" and
      .metadata.component.version == $image_digest and
      exact_apk("tiff"; $tiff_version) and
      exact_apk("openexr-libiex"; $openexr_version) and
      exact_apk("openexr-libilmthread"; $openexr_version) and
      exact_apk("openexr-libopenexr"; $openexr_version) and
      exact_apk("openexr-libopenexrcore"; $openexr_version)
    ' "$sbom_file" >/dev/null || fail 'DocuSeal: SBOM não corresponde ao image ID ou às versões nativas aprovadas.'
}

validate_docuseal_openvex() {
  vex_file=$1
  image_id=$2
  tiff_purl='pkg:apk/alpine/tiff@4.7.2-r0?arch=x86_64&distro=alpine-3.24.1'
  image_purl="pkg:oci/docuseal@$image_id?repository_url=maiocchi%2Fdocuseal&tag=$docuseal_version"

  jq -e \
    --arg tiff_purl "$tiff_purl" \
    --arg image_purl "$image_purl" '
      def exact_products($statement):
        ($statement.products | type == "array" and length == 2) and
        ([
          $statement.products[] |
          select(."@id" == $tiff_purl and (has("subcomponents") | not))
        ] | length == 1) and
        ([
          $statement.products[] |
          select(
            ."@id" == $image_purl and
            (.subcomponents | type == "array" and length == 1) and
            .subcomponents[0]."@id" == $tiff_purl
          )
        ] | length == 1);

      ([.statements[] | select(.vulnerability.name == "CVE-2023-52356")][0]) as $not_affected |
      ([.statements[] | select(.vulnerability.name == "CVE-2026-4775")][0]) as $fixed |
      .timestamp as $document_timestamp |
      (."@context" == "https://openvex.dev/ns/v0.2.0" and
       (."@id" | test("^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")) and
       .author == "Maiocchi Advogado" and
       .role == "Fornecedor do produto" and
       .version == 1 and
       (.timestamp | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
       (.statements | type == "array" and length == 2) and
       all(.statements[]; .timestamp == $document_timestamp) and
       ([.statements[] | select(.vulnerability.name == "CVE-2023-52356")] | length == 1) and
       ([.statements[] | select(.vulnerability.name == "CVE-2026-4775")] | length == 1) and
       $not_affected.status == "not_affected" and
       $not_affected.justification == "vulnerable_code_not_present" and
       exact_products($not_affected) and
       $fixed.status == "fixed" and
       ($fixed | has("justification") | not) and
       exact_products($fixed))
    ' "$vex_file" >/dev/null || fail 'DocuSeal: OpenVEX excede ou diverge das duas decisões TIFF aprovadas.'
}

validate_docuseal_grype_conservation() {
  raw_file=$1
  filtered_file=$2
  vex_file=$3

  jq -e -s '
    def epoch: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
    def normalized_matches:
      map(del(.appliedIgnoreRules)) |
      sort_by(tojson);
    def high_or_critical:
      . == "High" or . == "Critical";

    .[0] as $raw |
    .[1] as $filtered |
    .[2] as $vex |
    ($vex.timestamp | epoch) as $vex_at |
    ($raw.descriptor.timestamp | epoch) as $raw_at |
    ($filtered.descriptor.timestamp | epoch) as $filtered_at |
    [$raw.matches[] | select(.vulnerability.severity | high_or_critical)] as $raw_hc |
    (length == 3 and
     ($vex_at <= $raw_at) and
     ($raw_at <= $filtered_at) and
     (($filtered_at - $vex_at) <= 3600) and
     ($raw.matches | type == "array") and
     ($filtered.matches | type == "array") and
     ($filtered.ignoredMatches | type == "array") and
     ($raw_hc | length) == 2 and
     ([ $raw_hc[].vulnerability.id ] | sort) == ["CVE-2023-52356", "CVE-2026-4775"] and
     ([ $raw_hc[].vulnerability.id ] | unique | length) == ($raw_hc | length) and
     all($raw_hc[];
       . as $match |
       $match.artifact.name == "tiff" and
       $match.artifact.version == "4.7.2-r0" and
       $match.artifact.type == "apk" and
       $match.artifact.purl == "pkg:apk/alpine/tiff@4.7.2-r0?arch=x86_64&distro=alpine-3.24.1" and
       (["CVE-2023-52356", "CVE-2026-4775"] | index($match.vulnerability.id)) != null
     ) and
     all($filtered.matches[]; (.vulnerability.severity | high_or_critical | not)) and
     (($raw_hc | normalized_matches) == ($filtered.ignoredMatches | normalized_matches)) and
     all($filtered.ignoredMatches[];
       . as $match |
       any($match.appliedIgnoreRules[]?;
         .namespace == "vex" and
         ((
           $match.vulnerability.id == "CVE-2023-52356" and
           .["vex-status"] == "not_affected"
         ) or (
           $match.vulnerability.id == "CVE-2026-4775" and
           .["vex-status"] == "fixed"
         ))
       )
     ) and
     (($raw.matches | normalized_matches) == (($filtered.matches + $filtered.ignoredMatches) | normalized_matches)))
  ' "$raw_file" "$filtered_file" "$vex_file" >/dev/null || fail 'DocuSeal: filtragem Grype não conserva integralmente os achados, a ordem temporal ou o gate High/Critical.'
}

validate_docuseal_tiff_repository_evidence() {
  repository_manifest=$1
  apk_file=$2

  apkbuild_hash=$(awk '
    $2 == "APKBUILD" && $1 ~ /^[0-9a-f]{64}$/ { print $1 }
  ' "$repository_manifest")
  [ "$apkbuild_hash" = "$docuseal_tiff_apkbuild_sha256" ] || fail 'DocuSeal: APKBUILD no repositório TIFF diverge do hash aprovado.'

  recorded_apk_hash=$(awk -v expected="x86_64/tiff-$docuseal_tiff_version.apk" '
    $2 == expected && $1 ~ /^[0-9a-f]{64}$/ { print $1 }
  ' "$repository_manifest")
  [ -n "$recorded_apk_hash" ] && [ "$recorded_apk_hash" = "$(sha256_file "$apk_file")" ] || fail 'DocuSeal: APK TIFF não corresponde ao manifesto interno do repositório.'
}

validate_docuseal_native_packages_manifest() (
  native_manifest=$1
  image_id=$2
  runtime_tmp=$(mktemp -d "${TMPDIR:-/tmp}/maiocchi-native-manifest.XXXXXX") || fail 'DocuSeal: não foi possível criar diretório temporário para o manifesto nativo.'
  trap 'rm -rf "$runtime_tmp"' EXIT HUP INT TERM

  require_regular_file "$native_manifest" 'DocuSeal: manifesto dos pacotes nativos'
  [ "$(wc -l <"$native_manifest" | awk '{print $1}')" -eq 10 ] || fail 'DocuSeal: manifesto dos pacotes nativos não contém o conjunto fechado esperado.'
  awk '
    NF != 2 || $1 !~ /^sha1:[0-9a-f]{40}$/ || $2 !~ /^usr\/lib\/[A-Za-z0-9_.+-]+$/ { invalid = 1 }
    seen[$2]++ > 0 { invalid = 1 }
    END { exit invalid ? 1 : 0 }
  ' "$native_manifest" || fail 'DocuSeal: manifesto dos pacotes nativos possui hash, caminho ou duplicata inválidos.'
  actual_paths=$(awk '{print $2}' "$native_manifest" | LC_ALL=C sort)
  expected_paths=$(printf '%s\n' \
    usr/lib/libIex-3_4.so.33 \
    usr/lib/libIex-3_4.so.33.3.4.13 \
    usr/lib/libIlmThread-3_4.so.33 \
    usr/lib/libIlmThread-3_4.so.33.3.4.13 \
    usr/lib/libOpenEXR-3_4.so.33 \
    usr/lib/libOpenEXR-3_4.so.33.3.4.13 \
    usr/lib/libOpenEXRCore-3_4.so.33 \
    usr/lib/libOpenEXRCore-3_4.so.33.3.4.13 \
    usr/lib/libtiff.so.6 \
    usr/lib/libtiff.so.6.3.0 | LC_ALL=C sort)
  [ "$actual_paths" = "$expected_paths" ] || fail 'DocuSeal: caminhos do manifesto nativo divergem do conjunto fechado TIFF/OpenEXR.'

  docker run --rm \
    --network none \
    --read-only \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    --entrypoint /sbin/apk \
    "$image_id" \
    manifest \
    tiff \
    openexr-libiex \
    openexr-libilmthread \
    openexr-libopenexr \
    openexr-libopenexrcore \
    >"$runtime_tmp/runtime.manifest" || fail 'DocuSeal: não foi possível reler o manifesto nativo da imagem imutável.'
  LC_ALL=C sort "$native_manifest" >"$runtime_tmp/evidence.sorted"
  LC_ALL=C sort "$runtime_tmp/runtime.manifest" >"$runtime_tmp/runtime.sorted"
  cmp -s "$runtime_tmp/evidence.sorted" "$runtime_tmp/runtime.sorted" || fail 'DocuSeal: hashes SHA-1 do manifesto nativo divergem dos bytes da imagem imutável.'
  audit_output=$(docker run --rm \
    --network none \
    --read-only \
    --security-opt no-new-privileges:true \
    --cap-drop ALL \
    --entrypoint /sbin/apk \
    "$image_id" \
    audit --system) || fail 'DocuSeal: apk audit não conseguiu conferir os arquivos instalados.'
  [ -z "$audit_output" ] || fail 'DocuSeal: apk audit detectou arquivo de pacote divergente na imagem imutável.'
)

expect_inspect() {
  image_id=$1
  inspect_format=$2
  expected=$3
  description=$4

  actual=$(docker image inspect --format "$inspect_format" "$image_id") || fail "$description: imagem local indisponível."
  [ "$actual" = "$expected" ] || fail "$description: metadado divergente."
}

if [ "${1:-}" = '--validate-docuseal-report-set' ]; then
  for required_tool in jq grep; do
    command -v "$required_tool" >/dev/null 2>&1 || fail "$required_tool não está disponível."
  done
  shift
  [ "$#" -eq 5 ] || fail 'Modo DocuSeal interno requer image ID, SBOM, OpenVEX, Grype raw e Grype filtrado.'
  report_image_id=$1
  report_sbom=$2
  report_vex=$3
  report_raw=$4
  report_filtered=$5
  printf '%s\n' "$report_image_id" | grep -Eq '^sha256:[0-9a-f]{64}$' || fail 'DocuSeal: image ID interno inválido.'
  validate_docuseal_sbom "$report_sbom" "$report_image_id"
  validate_docuseal_openvex "$report_vex" "$report_image_id"
  validate_docuseal_grype_conservation "$report_raw" "$report_filtered" "$report_vex"
  printf '%s\n' 'Conjunto SBOM/OpenVEX/Grype DocuSeal aprovado.'
  exit 0
fi

if [ "${1:-}" = '--validate-semantic-evidence-set' ]; then
  for required_tool in shasum awk grep wc sort jq tar mktemp uniq; do
    command -v "$required_tool" >/dev/null 2>&1 || fail "$required_tool não está disponível."
  done
  shift
  [ "$#" -eq 10 ] || fail 'Modo semântico interno requer label, image ID, inspect, archive, SBOM, Grype raw, Grype filtrado ou -, metadata, revisão e usuário runtime esperado ou -.'
  validate_semantic_evidence_set "$@"
  printf '%s\n' 'Binding semântico das evidências aprovado.'
  exit 0
fi

for required_tool in git docker shasum awk sed grep wc sort find basename jq tar mktemp uniq cmp; do
  command -v "$required_tool" >/dev/null 2>&1 || fail "$required_tool não está disponível."
done

recipe_commit=$(git -C "$repo_dir" rev-parse --verify 'HEAD^{commit}') || fail 'Não foi possível resolver o commit da receita.'
printf '%s\n' "$recipe_commit" | grep -Eq '^[0-9a-f]{40}$' || fail 'HEAD da receita não é um SHA Git de 40 caracteres.'

git -C "$repo_dir" diff --quiet HEAD -- || fail 'Worktree rastreada diverge do commit da receita.'
git -C "$repo_dir" diff --cached --quiet || fail 'Índice Git diverge do commit da receita.'
git -C "$repo_dir" verify-commit "$recipe_commit" >/dev/null 2>&1 || fail 'Commit da receita não possui assinatura Git verificável.'
git -C "$repo_dir" cat-file -e "$portal_base_commit^{commit}" || fail 'Commit-base do portal não está disponível no repositório.'

[ -f "$portal_patch" ] && [ ! -L "$portal_patch" ] || fail 'Patch do portal ausente ou simbólico.'
[ -f "$docuseal_patch" ] && [ ! -L "$docuseal_patch" ] || fail 'Patch DocuSeal SSO ausente ou simbólico.'
[ -f "$docuseal_base_archive" ] && [ ! -L "$docuseal_base_archive" ] || fail 'Base DocuSeal ausente ou simbólica.'
[ -f "$docuseal_build_inputs_patch" ] && [ ! -L "$docuseal_build_inputs_patch" ] || fail 'Patch de inputs DocuSeal ausente ou simbólico.'
[ -f "$docuseal_native_security_patch" ] && [ ! -L "$docuseal_native_security_patch" ] || fail 'Patch de bibliotecas nativas DocuSeal ausente ou simbólico.'
[ -f "$docuseal_tiff_source" ] && [ ! -L "$docuseal_tiff_source" ] || fail 'Fonte TIFF 4.7.2 ausente ou simbólica.'

portal_patch_sha256=$(sha256_file "$portal_patch")
docuseal_patch_sha256=$(sha256_file "$docuseal_patch")
[ "$(sha256_file "$docuseal_base_archive")" = "$docuseal_base_sha256" ] || fail 'Base DocuSeal diverge do SHA-256 aprovado.'
[ "$(sha256_file "$docuseal_build_inputs_patch")" = "$docuseal_build_inputs_sha256" ] || fail 'Patch de inputs DocuSeal diverge do SHA-256 aprovado.'
[ "$(sha256_file "$docuseal_native_security_patch")" = "$docuseal_native_security_patch_sha256" ] || fail 'Patch de bibliotecas nativas DocuSeal diverge do SHA-256 aprovado.'
[ "$(sha256_file "$docuseal_tiff_source")" = "$docuseal_tiff_source_sha256" ] || fail 'Fonte TIFF 4.7.2 diverge do SHA-256 aprovado.'

portal_evidence_dir=${PORTAL_SSO_EVIDENCE_DIR:-}
docuseal_evidence_dir=${DOCUSEAL_SSO_EVIDENCE_DIR:-}
portal_image_id_before=$(read_image_id "$portal_evidence_dir" "portal-$portal_version.image-id.txt" 'Portal')
docuseal_image_id_before=$(read_image_id "$docuseal_evidence_dir" "docuseal-$docuseal_version.image-id.txt" 'DocuSeal')
validate_evidence_set "$portal_evidence_dir" 'Portal' \
  "portal-$portal_version.image-id.txt" \
  "portal-$portal_version.image-inspect.json" \
  "portal-$portal_version.docker-image.tar" \
  "portal-$portal_version.cdx.json" \
  "portal-$portal_version.grype.json" \
  "portal-$portal_version.scan-metadata.json"
validate_evidence_set "$docuseal_evidence_dir" 'DocuSeal' \
  "docuseal-$docuseal_version.image-id.txt" \
  "docuseal-$docuseal_version.image-inspect.json" \
  "docuseal-$docuseal_version.docker-image.tar" \
  "docuseal-$docuseal_version.cdx.json" \
  "docuseal-$docuseal_version.grype.raw.json" \
  "docuseal-$docuseal_version.openvex.json" \
  "docuseal-$docuseal_version.grype.json" \
  "docuseal-$docuseal_version.scan-metadata.json" \
  "docuseal-$docuseal_version.tiff-$docuseal_tiff_version.apk" \
  "docuseal-$docuseal_version.tiff-repository.SHA256SUMS" \
  "docuseal-$docuseal_version.native-packages.manifest"
portal_image_id=$(read_image_id "$portal_evidence_dir" "portal-$portal_version.image-id.txt" 'Portal')
docuseal_image_id=$(read_image_id "$docuseal_evidence_dir" "docuseal-$docuseal_version.image-id.txt" 'DocuSeal')
[ "$portal_image_id" = "$portal_image_id_before" ] || fail 'Portal: image ID mudou durante a verificação da evidência.'
[ "$docuseal_image_id" = "$docuseal_image_id_before" ] || fail 'DocuSeal: image ID mudou durante a verificação da evidência.'

if [ -n "${PORTAL_SSO_CANDIDATE_IMAGE_ID:-}" ]; then
  [ "$PORTAL_SSO_CANDIDATE_IMAGE_ID" = "$portal_image_id" ] || fail 'Portal: ID exportado diverge da evidência.'
fi
if [ -n "${DOCUSEAL_SSO_CANDIDATE_IMAGE_ID:-}" ]; then
  [ "$DOCUSEAL_SSO_CANDIDATE_IMAGE_ID" = "$docuseal_image_id" ] || fail 'DocuSeal: ID exportado diverge da evidência.'
fi

validate_semantic_evidence_set \
  'Portal' \
  "$portal_image_id" \
  "$portal_evidence_dir/portal-$portal_version.image-inspect.json" \
  "$portal_evidence_dir/portal-$portal_version.docker-image.tar" \
  "$portal_evidence_dir/portal-$portal_version.cdx.json" \
  "$portal_evidence_dir/portal-$portal_version.grype.json" \
  '-' \
  "$portal_evidence_dir/portal-$portal_version.scan-metadata.json" \
  "$recipe_commit" \
  '-'
validate_semantic_evidence_set \
  'DocuSeal' \
  "$docuseal_image_id" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.image-inspect.json" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.docker-image.tar" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.cdx.json" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.grype.raw.json" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.grype.json" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.scan-metadata.json" \
  "$recipe_commit" \
  'docuseal'

expect_inspect "$portal_image_id" '{{.Id}}' "$portal_image_id" 'Portal image ID'
expect_inspect "$portal_image_id" '{{.Os}}' 'linux' 'Portal sistema operacional'
expect_inspect "$portal_image_id" '{{.Architecture}}' 'amd64' 'Portal arquitetura'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$portal_version" 'Portal versão'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$recipe_commit" 'Portal revisão'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.base-commit" }}' "$portal_base_commit" 'Portal commit-base'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$portal_patch_sha256" 'Portal patch'
expect_inspect "$portal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$recipe_commit" 'Portal receita'

expect_inspect "$docuseal_image_id" '{{.Id}}' "$docuseal_image_id" 'DocuSeal image ID'
expect_inspect "$docuseal_image_id" '{{.Os}}' 'linux' 'DocuSeal sistema operacional'
expect_inspect "$docuseal_image_id" '{{.Architecture}}' 'amd64' 'DocuSeal arquitetura'
expect_inspect "$docuseal_image_id" '{{.Config.User}}' 'docuseal' 'DocuSeal usuário runtime'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$docuseal_version" 'DocuSeal versão'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$recipe_commit" 'DocuSeal revisão'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.base-source-sha256" }}' "$docuseal_base_sha256" 'DocuSeal base'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.patch-sha256" }}' "$docuseal_patch_sha256" 'DocuSeal patch SSO'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.build-inputs-patch-sha256" }}' "$docuseal_build_inputs_sha256" 'DocuSeal inputs de build'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.native-security-patch-sha256" }}' "$docuseal_native_security_patch_sha256" 'DocuSeal patch de segurança nativa'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.tiff-apkbuild-sha256" }}' "$docuseal_tiff_apkbuild_sha256" 'DocuSeal APKBUILD TIFF'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.tiff-source-sha256" }}' "$docuseal_tiff_source_sha256" 'DocuSeal fonte TIFF'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.tiff-version" }}' "$docuseal_tiff_version" 'DocuSeal versão TIFF'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.openexr-version" }}' "$docuseal_openexr_version" 'DocuSeal versão OpenEXR'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.ruby-base-digest" }}' "$docuseal_ruby_base_digest" 'DocuSeal digest Ruby'
expect_inspect "$docuseal_image_id" '{{ index .Config.Labels "br.adv.maiocchi.recipe-commit" }}' "$recipe_commit" 'DocuSeal receita'

validate_docuseal_sbom \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.cdx.json" \
  "$docuseal_image_id"
validate_docuseal_openvex \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.openvex.json" \
  "$docuseal_image_id"
validate_docuseal_grype_conservation \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.grype.raw.json" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.grype.json" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.openvex.json"
validate_docuseal_tiff_repository_evidence \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.tiff-repository.SHA256SUMS" \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.tiff-$docuseal_tiff_version.apk"
validate_docuseal_native_packages_manifest \
  "$docuseal_evidence_dir/docuseal-$docuseal_version.native-packages.manifest" \
  "$docuseal_image_id"

printf '%s\n' 'Preflight das imagens candidatas SSO aprovado.'
