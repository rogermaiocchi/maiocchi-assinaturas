# frozen_string_literal: true

# Locale seguro para canário/lab:
# - DocuSeal rejeita locales ausentes em I18n.available_locales (ex.: pt-BR → 500 no dashboard).
# - Preferência: DEFAULT_LOCALE se allowlisted; senão en-US; nunca pt-BR.
SAFE_LOCALES = %w[en en-US pt es fr de it].freeze
DEFAULT_SAFE_LOCALE = 'en-US'

def resolve_safe_locale
  candidate = ENV.fetch('DEFAULT_LOCALE', DEFAULT_SAFE_LOCALE).to_s.strip
  candidate = DEFAULT_SAFE_LOCALE if candidate.empty? || candidate == 'pt-BR' || candidate == 'pt_BR'
  available = begin
    I18n.available_locales.map { |locale| locale.to_s }
  rescue StandardError
    SAFE_LOCALES
  end
  allowlist = (SAFE_LOCALES & available)
  allowlist = SAFE_LOCALES if allowlist.empty?
  return candidate if allowlist.include?(candidate)

  allowlist.include?('en-US') ? 'en-US' : allowlist.fetch(0)
end

expected_uuid = '33333333-3333-4333-8333-333333333333'
configured_uuid = ENV.fetch('MAIOCCHI_CANARY_ACCOUNT_UUID')
abort 'candidate account UUID is not exact' unless configured_uuid == expected_uuid

safe_locale = resolve_safe_locale
attributes = {
  uuid: expected_uuid,
  name: 'Maiocchi Canário Sintético',
  locale: safe_locale,
  timezone: 'America/Sao_Paulo'
}.freeze

account = Account.find_by(uuid: expected_uuid)
if account
  # Self-heal: corrige locale inválido sem exigir recriação do account.
  if account.locale != safe_locale
    account.update!(locale: safe_locale)
  end
  actual = account.reload.attributes.slice('uuid', 'name', 'locale', 'timezone')
  expected = attributes.transform_keys(&:to_s)
  abort 'candidate account drift detected' unless actual == expected
  abort 'candidate account is archived' if account.archived_at.present?
else
  Account.create!(attributes)
end

abort 'candidate account postcondition failed' unless Account.active.where(uuid: expected_uuid).count == 1
abort 'candidate account locale is unsafe' unless Account.active.find_by!(uuid: expected_uuid).locale == safe_locale
puts "DocuSeal candidate account: synthetic-only, exact, active, locale=#{safe_locale}"
