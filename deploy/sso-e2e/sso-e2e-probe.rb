# frozen_string_literal: true

require 'base64'
require 'digest'
require 'fileutils'
require 'json'
require 'net/http'
require 'openssl'
require 'securerandom'
require 'time'
require 'uri'

class CandidateProbe
  UNO_ORIGIN = 'https://uno-canary.maiocchi.adv.br'
  SIGNATURE_ORIGIN = 'https://assinatura-canary.maiocchi.adv.br'
  REDIRECT_URI = "#{SIGNATURE_ORIGIN}/sso/maiocchi/callback"
  ACCOUNT_UUID = '33333333-3333-4333-8333-333333333333'
  STAFF_SUBJECT = '11111111-1111-4111-8111-111111111111'
  STAFF_DOCUMENT = '90000000094'
  STAFF_EMAIL = 'staff.canary@example.invalid'
  CLIENT_ID = 'maiocchi-signature'
  SCOPE = 'openid profile signature.manage'

  def initialize
    @ca_file = exact_file!('SSO_E2E_CA_FILE')
    @password_file = exact_file!('SSO_E2E_STAFF_PASSWORD_FILE')
    @client_secret_file = exact_file_path('/run/signature-canary-secrets/api_signature_sso_client_secret')
    @runtime_envelope_file = exact_file!('SSO_E2E_RUNTIME_ENVELOPE_FILE')
    @runtime_envelope_sha256 = Digest::SHA256.file(@runtime_envelope_file).hexdigest
    @evidence_file = ENV.fetch('SSO_E2E_EVIDENCE_FILE')
    @cookies = Hash.new { |hash, host| hash[host] = {} }
    @steps = []
  end

  def call
    refuse_existing_evidence!
    verify_entry_portal!
    authorize_location, docuseal_cookie_seen = begin_docuseal_flow!
    login_uno!(authorize_location)
    callback_location = authorize_in_uno!(authorize_location)
    dashboard_location = complete_docuseal_flow!(callback_location)
    verify_dashboard!(dashboard_location)
    verify_callback_replay_rejected!(callback_location)
    verify_token_replay_rejected!
    persist_evidence!(docuseal_cookie_seen)
    puts 'SSO E2E independent HTTP probe: portal, UNO, DocuSeal and anti-replay PASS'
  end

  private

  def exact_file!(name)
    exact_file_path(ENV.fetch(name))
  end

  def exact_file_path(path)
    real = File.realpath(path)
    abort "governed file is not regular: #{File.basename(path)}" unless File.file?(real) && !File.symlink?(path)
    real
  end

  def refuse_existing_evidence!
    directory = File.dirname(@evidence_file)
    abort 'evidence directory is not exact' unless File.directory?(directory) && !File.symlink?(directory)
    abort 'E2E evidence already exists' if File.exist?(@evidence_file) || File.symlink?(@evidence_file)
  end

  def request(method, raw_url, body: nil, headers: {}, follow_cookies: true)
    uri = URI.parse(raw_url)
    abort 'probe attempted non-HTTPS request' unless uri.is_a?(URI::HTTPS) && uri.port == 443 && uri.userinfo.nil?
    allowed_hosts = %w[uno-canary.maiocchi.adv.br assinatura-canary.maiocchi.adv.br]
    abort 'probe attempted foreign host' unless allowed_hosts.include?(uri.host)

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_PEER
    http.ca_file = @ca_file
    http.open_timeout = 5
    http.read_timeout = 15

    klass = Net::HTTP.const_get(method.to_s.capitalize)
    req = klass.new(uri.request_uri)
    req['Accept'] = 'text/html,application/json'
    req['User-Agent'] = 'Maiocchi-SSO-E2E/1.0'
    req['Cookie'] = cookie_header(uri.host) if follow_cookies && @cookies[uri.host].any?
    headers.each { |key, value| req[key] = value }
    req.body = body if body
    response = http.request(req)
    store_cookies(uri.host, response.get_fields('set-cookie') || []) if follow_cookies
    response
  end

  def cookie_header(host)
    @cookies.fetch(host).sort.map { |name, value| "#{name}=#{value}" }.join('; ')
  end

  def store_cookies(host, values)
    values.each do |line|
      pair = line.split(';', 2).first
      name, value = pair.split('=', 2)
      next if name.to_s.empty? || value.nil?
      validate_host_cookie!(line, name) if name.start_with?('__Host-')
      value.empty? ? @cookies[host].delete(name) : @cookies[host][name] = value
    end
  end

  def validate_host_cookie!(line, name)
    attributes = line.split(';').drop(1).map(&:strip)
    normalized = attributes.map(&:downcase)
    abort "#{name} is not Secure" unless normalized.include?('secure')
    abort "#{name} is not HttpOnly" unless normalized.include?('httponly')
    abort "#{name} path drift" unless normalized.include?('path=/')
    abort "#{name} SameSite drift" unless normalized.include?('samesite=lax')
    abort "#{name} unexpectedly has Domain" if normalized.any? { |attribute| attribute.start_with?('domain=') }
  end

  def absolute_location(response, origin)
    location = response['location'].to_s
    abort 'redirect location missing' if location.empty?
    URI.join(origin, location).to_s
  end

  def expect_status!(response, *expected)
    abort "unexpected HTTP status: #{response.code}" unless expected.include?(response.code.to_i)
  end

  def step!(name, details = {})
    @steps << { step: name, ok: true }.merge(details)
  end

  def verify_entry_portal!
    response = request(:get, "#{SIGNATURE_ORIGIN}/")
    expect_status!(response, 200)
    abort 'integrated access CTA missing' unless response.body.include?('Entrar com Portal Maiocchi')
    step!('signature_portal_entry', status: 200)
  end

  def begin_docuseal_flow!
    response = request(:get, "#{SIGNATURE_ORIGIN}/sso/maiocchi/start")
    expect_status!(response, 303)
    location = absolute_location(response, SIGNATURE_ORIGIN)
    abort 'DocuSeal authorize host drift' unless location.start_with?("#{UNO_ORIGIN}/api/auth/sso/authorize?")
    cookie_seen = @cookies['assinatura-canary.maiocchi.adv.br'].key?('__Host-docuseal_session')
    abort 'DocuSeal flow cookie missing' unless cookie_seen
    step!('docuseal_pkce_start', status: 303)
    [location, cookie_seen]
  end

  def login_uno!(authorize_location)
    anonymous = request(:get, authorize_location)
    expect_status!(anonymous, 302)
    login_location = absolute_location(anonymous, UNO_ORIGIN)
    abort 'anonymous authorize did not reach UNO login' unless login_location.start_with?("#{UNO_ORIGIN}/login?return_to=")

    password = File.binread(@password_file).sub(/\n\z/, '')
    response = request(
      :post,
      "#{UNO_ORIGIN}/api/auth/login/cpf",
      body: JSON.generate(documento: STAFF_DOCUMENT, senha: password),
      headers: {
        'Content-Type' => 'application/json',
        'Origin' => UNO_ORIGIN,
        'Referer' => "#{UNO_ORIGIN}/login"
      }
    )
    password.clear
    expect_status!(response, 200)
    payload = JSON.parse(response.body)
    abort 'UNO login contract failed' unless payload == { 'ok' => true, 'senha_temporaria' => false }
    abort 'UNO host-only session missing' unless @cookies['uno-canary.maiocchi.adv.br'].key?('__Host-maiocchi_session')
    step!('uno_synthetic_staff_login', status: 200)
  end

  def authorize_in_uno!(authorize_location)
    response = request(:get, authorize_location)
    expect_status!(response, 303)
    location = absolute_location(response, UNO_ORIGIN)
    uri = URI.parse(location)
    abort 'UNO callback URI drift' unless "#{uri.scheme}://#{uri.host}#{uri.path}" == REDIRECT_URI
    params = URI.decode_www_form(uri.query.to_s).to_h
    abort 'UNO callback fields invalid' unless params.keys.sort == %w[code state] && params.values.all? { |value| value.match?(/\A[A-Za-z0-9_-]{43}\z/) }
    step!('uno_authorization_code', status: 303)
    location
  end

  def complete_docuseal_flow!(callback_location)
    response = request(:get, callback_location)
    expect_status!(response, 303)
    location = absolute_location(response, SIGNATURE_ORIGIN)
    abort 'DocuSeal dashboard redirect drift' unless location == "#{SIGNATURE_ORIGIN}/dashboard"
    step!('docuseal_code_exchange', status: 303)
    location
  end

  def verify_dashboard!(dashboard_location)
    response = request(:get, dashboard_location)
    expect_status!(response, 200)
    abort 'DocuSeal dashboard unexpectedly returned sign-in' if response.body.match?(/<form[^>]+sign_in/i)
    step!('docuseal_authenticated_dashboard', status: 200)
  end

  def verify_callback_replay_rejected!(callback_location)
    response = request(:get, callback_location)
    expect_status!(response, 422)
    step!('docuseal_callback_replay_rejected', status: 422)
  end

  def verify_token_replay_rejected!
    verifier = SecureRandom.urlsafe_base64(64, false)
    nonce = SecureRandom.urlsafe_base64(32, false)
    state = SecureRandom.urlsafe_base64(32, false)
    challenge = Base64.urlsafe_encode64(Digest::SHA256.digest(verifier), padding: false)
    query = URI.encode_www_form(
      response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
      code_challenge: challenge, code_challenge_method: 'S256', state: state,
      nonce: nonce, scope: SCOPE, audience: CLIENT_ID
    )
    authorize = request(:get, "#{UNO_ORIGIN}/api/auth/sso/authorize?#{query}")
    expect_status!(authorize, 303)
    callback = URI.parse(absolute_location(authorize, UNO_ORIGIN))
    code = URI.decode_www_form(callback.query.to_s).to_h.fetch('code')

    client_secret = File.binread(@client_secret_file).sub(/\n\z/, '')
    basic = Base64.strict_encode64("#{CLIENT_ID}:#{client_secret}")
    client_secret.clear
    token_body = JSON.generate(
      grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT_URI,
      code_verifier: verifier, nonce: nonce
    )
    headers = { 'Authorization' => "Basic #{basic}", 'Content-Type' => 'application/json' }
    accepted = request(:post, "#{UNO_ORIGIN}/api/auth/sso/token", body: token_body, headers: headers, follow_cookies: false)
    expect_status!(accepted, 200)
    claims = JSON.parse(accepted.body)
    abort 'backchannel identity contract failed' unless claims['ok'] == true && claims['subject'] == STAFF_SUBJECT && claims['nonce'] == nonce
    @direct_exchange_id = claims['exchange_id'].to_s
    abort 'direct exchange_id contract failed' unless @direct_exchange_id.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/)
    replay = request(:post, "#{UNO_ORIGIN}/api/auth/sso/token", body: token_body, headers: headers, follow_cookies: false)
    expect_status!(replay, 400)
    replay_payload = JSON.parse(replay.body)
    abort 'authorization code replay was not rejected' unless replay_payload == { 'ok' => false, 'error' => 'invalid_grant' }
    [verifier, nonce, state, basic, token_body, code].each(&:clear)
    step!('uno_token_replay_rejected', first_status: 200, replay_status: 400)
  end

  def persist_evidence!(docuseal_cookie_seen)
    evidence = {
      schema: 'maiocchi.sso-protocol-e2e-result.v1',
      generated_at: Time.now.utc.iso8601,
      data_class: 'synthetic-only',
      public_exposure: false,
      execution_surface: 'cookie-aware HTTPS protocol probe; browser QA is a separate gate',
      tls_verification: 'private-ca-verify-peer',
      runtime_envelope_sha256: @runtime_envelope_sha256,
      docuseal_flow_cookie_seen: docuseal_cookie_seen,
      subject: STAFF_SUBJECT,
      account_uuid: ACCOUNT_UUID,
      direct_exchange_id: @direct_exchange_id,
      steps: @steps
    }
    File.open(@evidence_file, File::WRONLY | File::CREAT | File::EXCL, 0o400) do |file|
      file.write("#{JSON.pretty_generate(evidence)}\n")
      file.flush
      file.fsync
    end
  end
end

CandidateProbe.new.call
