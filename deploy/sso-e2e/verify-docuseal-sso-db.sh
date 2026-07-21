#!/bin/sh
set -eu
umask 077

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

for command in psql chmod wc; do
  command -v "$command" >/dev/null 2>&1 || fail "$command não está disponível."
done

output=${SSO_E2E_DB_EVIDENCE_FILE:-}
case "$output" in /evidence-output/sso-e2e-db-result.txt) ;; *) fail 'Destino de evidência DB divergente.' ;; esac
[ ! -e "$output" ] && [ ! -L "$output" ] || fail 'Evidência DB já existe.'

row=$(psql -X --no-password --set=ON_ERROR_STOP=1 --tuples-only --no-align --field-separator='|' <<'SQL'
SELECT
  i.provider,
  i.subject,
  a.uuid,
  lower(u.email),
  u.role,
  lower(i.email_at_link),
  i.external_role,
  (SELECT count(*) FROM maiocchi_sso_identities),
  (SELECT count(*) FROM maiocchi_sso_exchanges),
  count(e.id),
  min(e.exchange_id::text)
FROM maiocchi_sso_identities i
JOIN accounts a ON a.id = i.account_id
JOIN users u ON u.id = i.user_id
LEFT JOIN maiocchi_sso_exchanges e ON e.maiocchi_sso_identity_id = i.id
WHERE i.provider = 'maiocchi_uno'
GROUP BY i.id, i.provider, i.subject, a.uuid, u.email, u.role, i.email_at_link, i.external_role;
SQL
)

prefix='maiocchi_uno|11111111-1111-4111-8111-111111111111|33333333-3333-4333-8333-333333333333|staff.canary@example.invalid|admin|staff.canary@example.invalid|admin|1|1|1|'
case "$row" in
  "$prefix"????????-????-4???-[89ab]???-????????????) ;;
  *) fail 'Persistência SSO DocuSeal diverge do contrato sintético fechado.' ;;
esac

(set -C; printf 'maiocchi.docuseal-sso-db-result.v1|%s\n' "$row" >"$output") || \
  fail 'Não foi possível criar a evidência DB de modo exclusivo.'
chmod 0400 "$output"
[ "$(wc -l <"$output")" -eq 1 ] || fail 'Evidência DB deve possuir uma única linha.'
printf '%s\n' 'DocuSeal DB verifier independente: vínculo e exchange persistidos PASS'
