use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use axum::{
    Json, Router,
    body::Body,
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::{
    AGENT_VERSION,
    config::AgentConfig,
    confirmation,
    error::AgentError,
    model::{
        AgentStatus, CertificateList, EXTERNAL_TOKEN_TRUST_CLASSIFICATION, SignRequest,
        SignResponse, accepted_external_token_origins,
    },
    provider::TokenProvider,
};

const AUTHORIZATION_HTML: &str = include_str!("../assets/authorize.html");
const AUTHORIZATION_JAVASCRIPT: &str = include_str!("../assets/authorize.js");

#[derive(Clone)]
struct AppState {
    config: AgentConfig,
    provider: Arc<dyn TokenProvider>,
    replay_guard: Arc<ReplayGuard>,
}

struct ReplayGuard {
    reservations: Mutex<HashMap<String, DateTime<Utc>>>,
    path: PathBuf,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReplayEvent {
    session_id: String,
    expires_at: DateTime<Utc>,
    active: bool,
}

impl ReplayGuard {
    fn open(path: impl Into<PathBuf>) -> Result<Self, AgentError> {
        let path = path.into();
        validate_existing_replay_store(&path)?;
        let now = Utc::now();
        let mut reservations = HashMap::new();
        match fs::read_to_string(&path) {
            Ok(contents) => {
                for line in contents.lines().filter(|line| !line.trim().is_empty()) {
                    let event: ReplayEvent = serde_json::from_str(line).map_err(|_| {
                        AgentError::Configuration("Registro local de replay corrompido.".to_owned())
                    })?;
                    if event.active && event.expires_at > now {
                        reservations.insert(event.session_id, event.expires_at);
                    } else {
                        reservations.remove(&event.session_id);
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => {
                return Err(AgentError::Configuration(
                    "Registro local de replay indisponível.".to_owned(),
                ));
            }
        }
        Ok(Self {
            reservations: Mutex::new(reservations),
            path,
        })
    }

    fn reserve(&self, session_id: &str, expires_at: DateTime<Utc>) -> Result<(), AgentError> {
        let now = Utc::now();
        let mut reservations = self
            .reservations
            .lock()
            .map_err(|_| AgentError::ProviderFailure)?;
        reservations.retain(|_, expiry| *expiry > now);
        if reservations.contains_key(session_id) {
            return Err(AgentError::InvalidRequest(
                "A sessão local já foi utilizada.".to_owned(),
            ));
        }
        self.append(&ReplayEvent {
            session_id: session_id.to_owned(),
            expires_at,
            active: true,
        })?;
        reservations.insert(session_id.to_owned(), expires_at);
        Ok(())
    }

    fn release(&self, session_id: &str) -> Result<(), AgentError> {
        let mut reservations = self
            .reservations
            .lock()
            .map_err(|_| AgentError::ProviderFailure)?;
        let expires_at = reservations
            .get(session_id)
            .copied()
            .unwrap_or_else(Utc::now);
        self.append(&ReplayEvent {
            session_id: session_id.to_owned(),
            expires_at,
            active: false,
        })?;
        reservations.remove(session_id);
        Ok(())
    }

    fn append(&self, event: &ReplayEvent) -> Result<(), AgentError> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|_| AgentError::ProviderFailure)?;
        }
        let mut options = OpenOptions::new();
        options.create(true).append(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
        }
        let mut file = options
            .open(&self.path)
            .map_err(|_| AgentError::ProviderFailure)?;
        validate_open_replay_store(&file)?;
        let mut line = serde_json::to_vec(event).map_err(|_| AgentError::ProviderFailure)?;
        line.push(b'\n');
        file.write_all(&line)
            .map_err(|_| AgentError::ProviderFailure)?;
        file.flush().map_err(|_| AgentError::ProviderFailure)?;
        file.sync_data().map_err(|_| AgentError::ProviderFailure)
    }
}

fn validate_existing_replay_store(path: &std::path::Path) -> Result<(), AgentError> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => {
            return Err(AgentError::Configuration(
                "Registro local de replay indisponível.".to_owned(),
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(AgentError::Configuration(
            "Registro local de replay inseguro.".to_owned(),
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err(AgentError::Configuration(
                "Permissões do registro local de replay são inseguras.".to_owned(),
            ));
        }
    }
    Ok(())
}

fn validate_open_replay_store(file: &std::fs::File) -> Result<(), AgentError> {
    let metadata = file.metadata().map_err(|_| AgentError::ProviderFailure)?;
    if !metadata.is_file() {
        return Err(AgentError::ProviderFailure);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o077 != 0 {
            return Err(AgentError::ProviderFailure);
        }
    }
    Ok(())
}

pub async fn serve(
    config: AgentConfig,
    provider: Arc<dyn TokenProvider>,
) -> Result<(), AgentError> {
    let replay_guard = Arc::new(ReplayGuard::open(&config.replay_store_path)?);
    let listener = tokio::net::TcpListener::bind(config.bind_address)
        .await
        .map_err(|_| {
            AgentError::Configuration(
                "A porta local 35100 já está em uso ou indisponível.".to_owned(),
            )
        })?;
    let state = AppState {
        config: config.clone(),
        provider,
        replay_guard,
    };
    let router = router(state, config.clone());
    info!(address = %config.bind_address, "Maiocchi native PAdES agent started on loopback");
    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .map_err(|_| AgentError::ProviderFailure)
}

fn router(state: AppState, guard_config: AgentConfig) -> Router {
    Router::new()
        .route("/v1/authorize", get(authorize))
        .route("/v1/authorize.js", get(authorize_javascript))
        .route("/v1/status", get(status))
        .route("/v1/certificates", get(certificates))
        .route("/v1/sign", post(sign))
        .fallback(not_found)
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(middleware::from_fn_with_state(guard_config, loopback_guard))
        .with_state(state)
}

async fn authorize(State(state): State<AppState>) -> impl IntoResponse {
    let mut response = Html(AUTHORIZATION_HTML).into_response();
    security_headers(response.headers_mut());
    let policy = format!(
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' {}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        state.config.portal_origin
    );
    if let Ok(policy) = HeaderValue::from_str(&policy) {
        response
            .headers_mut()
            .insert(header::CONTENT_SECURITY_POLICY, policy);
    }
    response
}

async fn authorize_javascript(State(state): State<AppState>) -> impl IntoResponse {
    let source = authorization_javascript(&state.config.portal_origin);
    let mut response = Response::new(Body::from(source));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/javascript; charset=utf-8"),
    );
    security_headers(response.headers_mut());
    response
}

fn authorization_javascript(portal_origin: &str) -> String {
    let portal = serde_json::to_string(portal_origin)
        .unwrap_or_else(|_| "\"https://assinatura.maiocchi.adv.br\"".to_owned());
    let accepted_origins = serde_json::to_string(&accepted_external_token_origins())
        .expect("the fixed external-token origins are serializable");
    let trust_classification = serde_json::to_string(EXTERNAL_TOKEN_TRUST_CLASSIFICATION)
        .expect("the fixed trust classification is serializable");
    AUTHORIZATION_JAVASCRIPT
        .replace("__PORTAL_ORIGIN__", &portal)
        .replace("__ACCEPTED_TOKEN_ORIGINS__", &accepted_origins)
        .replace("__ACCEPTED_TRUST_CLASSIFICATION__", &trust_classification)
}

async fn status(State(state): State<AppState>) -> Json<AgentStatus> {
    Json(AgentStatus {
        status: "ok",
        version: AGENT_VERSION,
        provider: state.provider.provider_name(),
        architecture: std::env::consts::ARCH,
        profile: state.provider.profile(),
        token_policy: state.provider.token_policy(),
    })
}

async fn certificates(State(state): State<AppState>) -> Result<Json<CertificateList>, AgentError> {
    let provider = state.provider.clone();
    let certificates = tokio::task::spawn_blocking(move || provider.list_certificates())
        .await
        .map_err(|_| AgentError::ProviderFailure)??;
    Ok(Json(CertificateList { certificates }))
}

async fn sign(
    State(state): State<AppState>,
    Json(request): Json<SignRequest>,
) -> Result<Json<SignResponse>, AgentError> {
    let request = request.validate(Utc::now())?;
    state
        .replay_guard
        .reserve(&request.session_id, request.expires_at)?;
    let session_id = request.session_id.clone();
    let fingerprint = request.certificate_fingerprint_sha256.clone();
    let replay_guard = state.replay_guard.clone();
    let provider = state.provider.clone();
    let operation = tokio::task::spawn_blocking(move || {
        confirmation::confirm(&request.document_name, &request.document_sha256)?;
        provider.sign(
            &request.data_to_sign,
            &request.certificate_fingerprint_sha256,
        )
    })
    .await
    .map_err(|_| AgentError::ProviderFailure)?;

    match operation {
        Ok(signature) => Ok(Json(SignResponse {
            session_id,
            signature_base64: STANDARD.encode(signature),
            certificate_fingerprint_sha256: fingerprint,
        })),
        Err(error) => {
            replay_guard.release(&session_id)?;
            Err(error)
        }
    }
}

async fn not_found() -> impl IntoResponse {
    StatusCode::NOT_FOUND
}

async fn loopback_guard(
    State(config): State<AgentConfig>,
    request: Request,
    next: Next,
) -> Response {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if !matches!(
        host.as_str(),
        "127.0.0.1:35100" | "localhost:35100" | "[::1]:35100"
    ) {
        return guard_error(
            StatusCode::FORBIDDEN,
            "host_not_allowed",
            "Host local não autorizado.",
        );
    }

    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let fetch_site = request
        .headers()
        .get("sec-fetch-site")
        .and_then(|value| value.to_str().ok());
    let fetch_mode = request
        .headers()
        .get("sec-fetch-mode")
        .and_then(|value| value.to_str().ok());
    let path = request.uri().path();
    let local_get = request.method() == Method::GET
        && (fetch_site == Some("same-origin")
            || (matches!(path, "/v1/authorize" | "/v1/authorize.js")
                && (fetch_mode == Some("navigate") || fetch_site == Some("none"))));
    let public_status_probe =
        request.method() == Method::GET && path == "/v1/status" && origin.is_none();
    let allowed_origin = origin
        .as_deref()
        .map(|value| config.allowed_origins.contains(value))
        .unwrap_or(false);
    if !allowed_origin && !local_get && !public_status_probe {
        return guard_error(
            StatusCode::FORBIDDEN,
            "origin_not_allowed",
            "Origem não autorizada.",
        );
    }

    if request.method() == Method::OPTIONS {
        let Some(origin) = origin.as_deref() else {
            return guard_error(
                StatusCode::FORBIDDEN,
                "origin_not_allowed",
                "Origem não autorizada.",
            );
        };
        let mut response = StatusCode::NO_CONTENT.into_response();
        apply_cors(response.headers_mut(), origin);
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, POST, OPTIONS"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("content-type"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_MAX_AGE,
            HeaderValue::from_static("600"),
        );
        return response;
    }

    let mut response = next.run(request).await;
    if let Some(origin) = origin.as_deref() {
        apply_cors(response.headers_mut(), origin);
    }
    security_headers(response.headers_mut());
    response
}

fn apply_cors(headers: &mut HeaderMap, origin: &str) {
    if let Ok(origin) = HeaderValue::from_str(origin) {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
        headers.insert(header::VARY, HeaderValue::from_static("Origin"));
        headers.insert(
            HeaderName::from_static("access-control-allow-private-network"),
            HeaderValue::from_static("true"),
        );
    }
}

fn security_headers(headers: &mut HeaderMap) {
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        HeaderName::from_static("referrer-policy"),
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        HeaderName::from_static("x-frame-options"),
        HeaderValue::from_static("DENY"),
    );
}

fn guard_error(status: StatusCode, code: &str, message: &str) -> Response {
    let payload = serde_json::json!({ "error": { "code": code, "message": message } });
    let mut response = (status, Json(payload)).into_response();
    security_headers(response.headers_mut());
    response
}

async fn shutdown_signal() {
    if tokio::signal::ctrl_c().await.is_err() {
        warn!("Failed to install shutdown signal handler");
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashSet, fs, sync::Arc};

    use axum::{
        body::Body,
        http::{Request, StatusCode, header},
    };
    use chrono::{Duration, Utc};
    use tower::ServiceExt;

    use super::{AppState, ReplayGuard, authorization_javascript, router};
    use crate::{
        config::AgentConfig, error::AgentError, model::CertificateDescriptor,
        provider::TokenProvider,
    };

    struct MockProvider;

    impl TokenProvider for MockProvider {
        fn provider_name(&self) -> &'static str {
            "mock"
        }
        fn profile(&self) -> &'static str {
            "test"
        }
        fn token_policy(&self) -> &'static str {
            "fail-closed"
        }
        fn list_certificates(&self) -> Result<Vec<CertificateDescriptor>, AgentError> {
            Ok(Vec::new())
        }
        fn sign(&self, _data: &[u8], _fingerprint_sha256: &str) -> Result<Vec<u8>, AgentError> {
            Err(AgentError::ProviderFailure)
        }
    }

    fn test_router() -> axum::Router {
        let portal_origin = "https://assinatura.maiocchi.adv.br".to_owned();
        let config = AgentConfig {
            bind_address: "127.0.0.1:35100".parse().expect("loopback"),
            portal_origin: portal_origin.clone(),
            allowed_origins: Arc::new(HashSet::from([portal_origin])),
            replay_store_path: std::env::temp_dir()
                .join(format!("maiocchi-replay-{}.jsonl", uuid::Uuid::new_v4())),
        };
        let state = AppState {
            config: config.clone(),
            provider: Arc::new(MockProvider),
            replay_guard: Arc::new(
                ReplayGuard::open(&config.replay_store_path).expect("replay guard"),
            ),
        };
        router(state, config)
    }

    #[test]
    fn replay_guard_blocks_same_live_session_and_releases_failures() {
        let path =
            std::env::temp_dir().join(format!("maiocchi-replay-{}.jsonl", uuid::Uuid::new_v4()));
        let guard = ReplayGuard::open(&path).expect("replay guard");
        let expiry = Utc::now() + Duration::seconds(120);
        assert!(guard.reserve("session", expiry).is_ok());
        assert!(guard.reserve("session", expiry).is_err());
        assert!(guard.release("session").is_ok());
        assert!(guard.reserve("session", expiry).is_ok());
        let reopened = ReplayGuard::open(&path).expect("reopened replay guard");
        assert!(reopened.reserve("session", expiry).is_err());
        let _ = fs::remove_file(path);
    }

    #[cfg(unix)]
    #[test]
    fn replay_guard_rejects_a_preexisting_permissive_store() {
        use std::os::unix::fs::PermissionsExt;

        let path =
            std::env::temp_dir().join(format!("maiocchi-replay-{}.jsonl", uuid::Uuid::new_v4()));
        fs::write(&path, "").expect("replay fixture");
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).expect("permissions");
        assert!(ReplayGuard::open(&path).is_err());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn authorization_uses_the_same_verified_hardware_contract_as_providers() {
        let source = authorization_javascript("https://assinatura.maiocchi.adv.br");
        assert!(source.contains("Windows-CNG-SmartCard"));
        assert!(source.contains("PKCS11-removable-hardware"));
        assert!(source.contains("external-token-verified"));
        assert!(!source.contains("__ACCEPTED_"));
        assert!(!source.contains("external-token-unverified"));
    }

    #[tokio::test]
    async fn allows_top_level_authorization_navigation_without_exposing_ticket() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .uri("/v1/authorize")
                    .header(header::HOST, "127.0.0.1:35100")
                    .header("sec-fetch-mode", "navigate")
                    .header("sec-fetch-site", "cross-site")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers().get("x-frame-options").unwrap(), "DENY");
    }

    #[tokio::test]
    async fn rejects_untrusted_origins_and_hosts() {
        let untrusted = test_router()
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/v1/status")
                    .header(header::HOST, "127.0.0.1:35100")
                    .header(header::ORIGIN, "https://example.test")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(untrusted.status(), StatusCode::FORBIDDEN);

        let forged_host = test_router()
            .oneshot(
                Request::builder()
                    .uri("/v1/status")
                    .header(header::HOST, "example.test")
                    .header(header::ORIGIN, "https://assinatura.maiocchi.adv.br")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(forged_host.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn reflects_only_configured_origin_with_private_network_header() {
        let response = test_router()
            .oneshot(
                Request::builder()
                    .uri("/v1/status")
                    .header(header::HOST, "127.0.0.1:35100")
                    .header(header::ORIGIN, "https://assinatura.maiocchi.adv.br")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
                .unwrap(),
            "https://assinatura.maiocchi.adv.br"
        );
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-private-network")
                .unwrap(),
            "true"
        );
    }

    #[tokio::test]
    async fn permits_originless_status_probe_but_not_certificate_access() {
        let app = test_router();
        let status = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/v1/status")
                    .header(header::HOST, "127.0.0.1:35100")
                    .body(Body::empty())
                    .expect("status request"),
            )
            .await
            .expect("status response");
        assert_eq!(status.status(), StatusCode::OK);

        let certificates = app
            .oneshot(
                Request::builder()
                    .uri("/v1/certificates")
                    .header(header::HOST, "127.0.0.1:35100")
                    .body(Body::empty())
                    .expect("certificates request"),
            )
            .await
            .expect("certificates response");
        assert_eq!(certificates.status(), StatusCode::FORBIDDEN);
    }
}
