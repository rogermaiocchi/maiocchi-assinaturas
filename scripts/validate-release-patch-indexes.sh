#!/bin/sh
set -eu
umask 077

repo_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
portal_base_commit='7e864d548b39ff3bbdcc6693f0bc05b3a72ed44d'
portal_patch="$repo_dir/patches/portal/0001-maiocchi-sso-portal-1.15.1.patch"
docuseal_base="$repo_dir/compliance/docuseal-maiocchi-3.0.1-maiocchi.14.tar.gz"
docuseal_patch="$repo_dir/patches/docuseal/0009-maiocchi-uno-sso.patch"
docuseal_build_inputs_patch="$repo_dir/patches/docuseal/0010-pin-build-inputs.patch"
docuseal_native_security_patch="$repo_dir/patches/docuseal/0011-update-native-image-libraries.patch"
docuseal_certificate_join_patch="$repo_dir/patches/docuseal/0012-uno-certificate-return-to-join.patch"
docuseal_source_notice_patch="$repo_dir/patches/docuseal/0013-restore-agpl-network-source-notice.patch"
docuseal_tiff_source="$repo_dir/compliance/sources/tiff-4.7.2.tar.gz"
docuseal_corresponding_source="$repo_dir/public/legal/source/docuseal-maiocchi-3.0.1-maiocchi.15.tar.gz"

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
  diff_count=0
  index_count=0
  index_seen=0

  while IFS= read -r line; do
    case "$line" in
      'diff --git a/'*)
        if [ "$diff_count" -gt 0 ] && [ "$index_seen" -ne 1 ]; then
          printf '%s\n' "Diff sem exatamente um índice de blob: $patch_file ($old_path)" >&2
          return 1
        fi
        diff_count=$((diff_count + 1))
        index_seen=0
        old_path=$(printf '%s\n' "$line" | awk '{print $3}' | sed 's#^a/##')
        new_path=$(printf '%s\n' "$line" | awk '{print $4}' | sed 's#^b/##')
        ;;
      'index '*)
        if [ "$diff_count" -eq 0 ]; then
          printf '%s\n' "Índice de blob fora de um diff: $patch_file" >&2
          return 1
        fi
        index_seen=$((index_seen + 1))
        index_count=$((index_count + 1))
        if [ "$index_seen" -ne 1 ]; then
          printf '%s\n' "Diff com mais de um índice de blob: $patch_file ($old_path)" >&2
          return 1
        fi
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

  if [ "$diff_count" -eq 0 ] || [ "$index_seen" -ne 1 ] || [ "$diff_count" -ne "$index_count" ]; then
    printf '%s\n' "Cobertura incompleta de índices de blob: $patch_file (diffs=$diff_count índices=$index_count)" >&2
    return 1
  fi
}

audit_patch_line_accounting() {
  patch_file=$1

  raw_counts=$(awk '
    /^\+\+\+ (b\/|\/dev\/null$)/ { next }
    /^--- (a\/|\/dev\/null$)/ { next }
    /^\+/ { added += 1; next }
    /^-/ { deleted += 1 }
    END { print added + 0, deleted + 0 }
  ' "$patch_file")
  raw_added=${raw_counts%% *}
  raw_deleted=${raw_counts#* }

  applied_counts=$(git apply --numstat "$patch_file" | awk '
    $1 !~ /^[0-9]+$/ || $2 !~ /^[0-9]+$/ { exit 1 }
    { added += $1; deleted += $2 }
    END { print added + 0, deleted + 0 }
  ')
  applied_added=${applied_counts%% *}
  applied_deleted=${applied_counts#* }

  [ "$raw_added" -eq "$applied_added" ] && [ "$raw_deleted" -eq "$applied_deleted" ] || {
    printf '%s\n' "Contagem de linhas fora dos hunks reconhecidos: $patch_file" >&2
    return 1
  }
}

audit_patch_hunks() {
  patch_file=$1

  awk -v patch_file="$patch_file" '
    function die(message) {
      print "Hunk inválido em " patch_file ": " message > "/dev/stderr"
      failed = 1
      exit 1
    }

    function finish_hunk() {
      if (in_hunk && (old_remaining != 0 || new_remaining != 0)) {
        die("contagem declarada não corresponde ao conteúdo")
      }
      in_hunk = 0
    }

    function range_count(token, marker, parts, count) {
      if (substr(token, 1, 1) != marker) {
        die("range sem marcador esperado")
      }
      token = substr(token, 2)
      if (token !~ /^[0-9]+(,[0-9]+)?$/) {
        die("range malformado")
      }
      count = split(token, parts, ",") == 1 ? 1 : parts[2] + 0
      return count
    }

    /^diff --git / {
      finish_hunk()
      in_diff = 1
      next
    }

    /^@@ / {
      if (!in_diff) {
        die("hunk fora de um diff")
      }
      finish_hunk()
      if ($1 != "@@" || $4 != "@@") {
        die("header de hunk malformado")
      }
      old_remaining = range_count($2, "-")
      new_remaining = range_count($3, "+")
      in_hunk = 1
      hunk_count += 1
      next
    }

    {
      if (in_hunk) {
        prefix = substr($0, 1, 1)
        if (prefix == " ") {
          old_remaining -= 1
          new_remaining -= 1
        } else if (prefix == "+") {
          new_remaining -= 1
        } else if (prefix == "-") {
          old_remaining -= 1
        } else {
          die("linha sem prefixo de diff dentro do hunk")
        }
        if (old_remaining < 0 || new_remaining < 0) {
          die("conteúdo excede a contagem declarada")
        }
        if (old_remaining == 0 && new_remaining == 0) {
          in_hunk = 0
        }
        next
      }

      if ($0 ~ /^\\ No newline at end of file$/ ||
          $0 ~ /^\+\+\+ (b\/|\/dev\/null$)/ ||
          $0 ~ /^--- (a\/|\/dev\/null$)/) {
        next
      }
      if ($0 ~ /^[ +\-\\]/) {
        die("linha com aparência de conteúdo fora de hunk")
      }
    }

    END {
      if (!failed) {
        finish_hunk()
        if (hunk_count == 0) {
          die("patch sem hunk reconhecido")
        }
      }
    }
  ' "$patch_file"
}

portal_source="$audit_root/portal-source"
docuseal_source="$audit_root/docuseal-source"
offered_source="$audit_root/offered-source"
mkdir "$portal_source" "$docuseal_source" "$offered_source"

git -C "$repo_dir" archive \
  --format=tar \
  --output="$audit_root/portal-base.tar" \
  "$portal_base_commit"
tar -xf "$audit_root/portal-base.tar" -C "$portal_source"
audit_patch_hunks "$portal_patch"
audit_patch_line_accounting "$portal_patch"
audit_patch_indexes "$portal_source" "$portal_patch" before
git -C "$portal_source" apply --check "$portal_patch"
git -C "$portal_source" apply "$portal_patch"
audit_patch_indexes "$portal_source" "$portal_patch" after

tar -xzf "$docuseal_base" -C "$docuseal_source"
audit_patch_hunks "$docuseal_patch"
audit_patch_line_accounting "$docuseal_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_patch" before
git -C "$docuseal_source" apply --check "$docuseal_patch"
git -C "$docuseal_source" apply "$docuseal_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_patch" after
audit_patch_hunks "$docuseal_build_inputs_patch"
audit_patch_line_accounting "$docuseal_build_inputs_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_build_inputs_patch" before
git -C "$docuseal_source" apply --check "$docuseal_build_inputs_patch"
git -C "$docuseal_source" apply "$docuseal_build_inputs_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_build_inputs_patch" after
audit_patch_hunks "$docuseal_native_security_patch"
audit_patch_line_accounting "$docuseal_native_security_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_native_security_patch" before
git -C "$docuseal_source" apply --check "$docuseal_native_security_patch"
git -C "$docuseal_source" apply "$docuseal_native_security_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_native_security_patch" after
audit_patch_hunks "$docuseal_certificate_join_patch"
audit_patch_line_accounting "$docuseal_certificate_join_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_certificate_join_patch" before
git -C "$docuseal_source" apply --check "$docuseal_certificate_join_patch"
git -C "$docuseal_source" apply "$docuseal_certificate_join_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_certificate_join_patch" after
audit_patch_hunks "$docuseal_source_notice_patch"
audit_patch_line_accounting "$docuseal_source_notice_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_source_notice_patch" before
git -C "$docuseal_source" apply --check "$docuseal_source_notice_patch"
git -C "$docuseal_source" apply "$docuseal_source_notice_patch"
audit_patch_indexes "$docuseal_source" "$docuseal_source_notice_patch" after

cp "$docuseal_tiff_source" "$docuseal_source/build/tiff/tiff-4.7.2.tar.gz"
tar -tzf "$docuseal_corresponding_source" >"$audit_root/offered-source.list"
[ "$(wc -l <"$audit_root/offered-source.list" | tr -d '[:space:]')" -le 5000 ] || {
  printf '%s\n' 'Archive de fonte correspondente excede 5.000 entradas.' >&2
  exit 1
}
while IFS= read -r archive_entry; do
  case "$archive_entry" in
    ''|/*|../*|*/../*|*/..) printf '%s\n' 'Archive de fonte correspondente contém caminho inseguro.' >&2; exit 1 ;;
  esac
done <"$audit_root/offered-source.list"
[ "$(tar -tvzf "$docuseal_corresponding_source" | cut -c1 | sort -u | tr -d '\n')" = '-' ] || {
  printf '%s\n' 'Archive de fonte correspondente deve conter somente arquivos regulares.' >&2
  exit 1
}
tar -xzf "$docuseal_corresponding_source" -C "$offered_source"
(
  cd "$docuseal_source"
  find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) >"$audit_root/reconstructed.SHA256SUMS"
(
  cd "$offered_source"
  find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256
) >"$audit_root/offered.SHA256SUMS"
cmp -s "$audit_root/reconstructed.SHA256SUMS" "$audit_root/offered.SHA256SUMS" || {
  printf '%s\n' 'Archive oferecido não corresponde byte a byte à fonte reconstruída.' >&2
  exit 1
}

printf '%s\n' 'Metadados de blobs e fonte correspondente dos patches Portal/DocuSeal 0009-0013: PASS'
