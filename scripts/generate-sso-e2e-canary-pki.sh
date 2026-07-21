#!/bin/sh
set -eu
umask 077

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ "$#" -eq 1 ] || fail 'Uso: generate-sso-e2e-canary-pki.sh DIRETORIO-NOVO'
[ "$(id -u)" -eq 0 ] || fail 'A PKI E2E deve ser gerada como root.'
for command in openssl mktemp grep install mkdir awk rm; do
  command -v "$command" >/dev/null 2>&1 || fail "$command não está disponível."
done

target=$1
case "$target" in
  /*) ;;
  *) fail 'O diretório de PKI deve ser absoluto.' ;;
esac
[ ! -e "$target" ] && [ ! -L "$target" ] || fail 'O destino já existe; use um diretório novo por execução.'

parent=$(dirname -- "$target")
[ -d "$parent" ] && [ ! -L "$parent" ] || fail 'O diretório pai está ausente ou é simbólico.'

tmp_dir=$(mktemp -d "$parent/.sso-e2e-pki.XXXXXX")
cleanup() {
  [ -n "${tmp_dir:-}" ] && [ -d "$tmp_dir" ] && rm -rf -- "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

cat >"$tmp_dir/ca.cnf" <<'EOF'
[req]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no

[dn]
CN = Maiocchi SSO E2E Ephemeral Root
O = Maiocchi Advogado

[v3_ca]
basicConstraints = critical,CA:TRUE,pathlen:0
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always
EOF

cat >"$tmp_dir/server.cnf" <<'EOF'
[req]
distinguished_name = dn
req_extensions = v3_req
prompt = no

[dn]
CN = uno-canary.maiocchi.adv.br
O = Maiocchi Advogado

[v3_req]
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = critical,serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = uno-canary.maiocchi.adv.br
DNS.2 = assinatura-canary.maiocchi.adv.br
EOF

openssl req -new -newkey rsa:3072 -nodes -sha256 \
  -keyout "$tmp_dir/ca.key" -x509 -days 2 \
  -config "$tmp_dir/ca.cnf" -out "$tmp_dir/ca.crt" >/dev/null 2>&1

openssl req -new -newkey rsa:3072 -nodes -sha256 \
  -keyout "$tmp_dir/server.key" -config "$tmp_dir/server.cnf" \
  -out "$tmp_dir/server.csr" >/dev/null 2>&1

openssl x509 -req -sha256 -days 2 \
  -in "$tmp_dir/server.csr" -CA "$tmp_dir/ca.crt" -CAkey "$tmp_dir/ca.key" \
  -CAcreateserial -extfile "$tmp_dir/server.cnf" -extensions v3_req \
  -out "$tmp_dir/server.crt" >/dev/null 2>&1

openssl verify -CAfile "$tmp_dir/ca.crt" "$tmp_dir/server.crt" >/dev/null
openssl x509 -checkend 3600 -noout -in "$tmp_dir/server.crt" >/dev/null || \
  fail 'O certificado efêmero não possui ao menos uma hora de validade.'

mkdir -m 0700 "$target"
install -m 0444 "$tmp_dir/ca.crt" "$target/ca.crt"
install -m 0444 "$tmp_dir/server.crt" "$target/server.crt"
install -m 0400 "$tmp_dir/server.key" "$target/server.key"

cert_sha=$(openssl dgst -sha256 "$target/server.crt" | awk '{print $NF}')
printf 'PKI E2E efêmera criada; certificado SHA-256=%s\n' "$cert_sha"
