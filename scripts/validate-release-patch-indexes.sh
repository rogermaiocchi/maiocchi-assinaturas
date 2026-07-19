#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
portal_base_commit='7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d'
portal_patch="$repo_dir/patches/portal/0001-maiocchi-sso-portal-1.15.1.patch"
docuseal_base="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
docuseal_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
docuseal_build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"

audit_root=$(mktemp -d "${TMPDIR:-/tmp}/maiocchi-patch-indexes.XXXXXX")
cleanup() {
  case "$audit_root" in
    "${TMPDIR:-/tmp}"/maiocchi-patch-indexes.*) rm -rf -- "$audit_root" ;;
    *) printf '%s\n' 'Diretório temporário inesperado; limpeza recusada.' >&2 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

audit_patch_indexes() {
  source_dir=$1
  patch_file=$2
  phase=$3
  old_path=''
  new_path=''

  while IFS= read -r line; do
    case "$line" in
      'diff --git a/'*)
        old_path=$(printf '%s\n' "$line" | awk '{print $3}' | sed 's#^a/##')
        new_path=$(printf '%s\n' "$line" | awk '{print $4}' | sed 's#^b/##')
        ;;
      'index '*)
        hashes=$(printf '%s\n' "$line" | awk '{print $2}')
        old_hash=${hashes%%..*}
        new_hash=${hashes#*..}

        if [ "$phase" = before ]; then
          if printf '%s' "$old_hash" | grep -Eq '^0+$'; then
            [ ! -e "$source_dir/$old_path" ]
          else
            actual_hash=$(git hash-object "$source_dir/$old_path")
            case "$actual_hash" in
              "$old_hash"*) ;;
              *)
                printf '%s\n' "Blob de origem divergente: $old_path" >&2
                return 1
                ;;
            esac
          fi
        else
          if printf '%s' "$new_hash" | grep -Eq '^0+$'; then
            [ ! -e "$source_dir/$new_path" ]
          else
            actual_hash=$(git hash-object "$source_dir/$new_path")
            case "$actual_hash" in
              "$new_hash"*) ;;
              *)
                printf '%s\n' "Blob de destino divergente: $new_path" >&2
                return 1
                ;;
            esac
          fi
        fi
        ;;
    esac
  done <"$patch_file"
}

portal_source="$audit_root/portal-source"
docuseal_source="$audit_root/docuseal-source"
mkdir "$portal_source" "$docuseal_source"

git -C "$repo_dir" archive \
  --format=tar \
  --output="$audit_root/portal-base.tar" \
  "$portal_base_commit"
tar -xf "$audit_root/portal-base.tar" -C "$portal_source"
audit_patch_indexes "$portal_source" "$portal_patch" before
git -C "$portal_source" apply --check "$portal_patch"
git -C "$portal_source" apply "$portal_patch"
audit_patch_indexes "$portal_source" "$portal_patch" after

tar -xzf "$docuseal_base" -C "$docuseal_source"
audit_patch_indexes "$docuseal_source" "$docuseal_patch" before
git -C "$docuseal_source" apply --check "$docuseal_patch"
git -C "$docuseal_source" apply "$docuseal_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_patch" after
audit_patch_indexes "$docuseal_source" "$docuseal_build_inputs_patch" before
git -C "$docuseal_source" apply --check "$docuseal_build_inputs_patch"
git -C "$docuseal_source" apply "$docuseal_build_inputs_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_build_inputs_patch" after

printf '%s\n' 'Metadados de blobs dos patches Portal, DocuSeal SSO e inputs de build: PASS'
