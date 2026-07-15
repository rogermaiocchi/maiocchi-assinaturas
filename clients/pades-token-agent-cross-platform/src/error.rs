use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AgentError {
    #[error("{0}")]
    Configuration(String),
    #[error("{0}")]
    InvalidRequest(String),
    #[error("Certificado não encontrado no dispositivo.")]
    CertificateNotFound,
    #[error("A chave não atende à política RSA de 2048 bits ou superior.")]
    UnsupportedKey,
    #[error("A operação foi cancelada pelo titular.")]
    UserCancelled,
    #[error("A confirmação nativa não está disponível.")]
    ConfirmationUnavailable,
    #[error("O token exige caminho protegido para autenticação local.")]
    ProtectedAuthenticationRequired,
    #[error("Nenhum token criptográfico elegível foi encontrado.")]
    TokenUnavailable,
    #[error("O middleware criptográfico não pôde concluir a operação.")]
    ProviderFailure,
    #[error("O sistema operacional não é suportado por este binário.")]
    UnsupportedPlatform,
}

#[derive(Serialize)]
struct ErrorEnvelope {
    error: ErrorDetail,
}

#[derive(Serialize)]
struct ErrorDetail {
    code: &'static str,
    message: String,
}

impl AgentError {
    pub fn status_and_code(&self) -> (StatusCode, &'static str) {
        match self {
            Self::InvalidRequest(_) => (StatusCode::BAD_REQUEST, "invalid_request"),
            Self::CertificateNotFound => (StatusCode::NOT_FOUND, "certificate_not_found"),
            Self::UnsupportedKey => (StatusCode::UNPROCESSABLE_ENTITY, "unsupported_key"),
            Self::UserCancelled => (StatusCode::CONFLICT, "user_cancelled"),
            Self::ConfirmationUnavailable => {
                (StatusCode::SERVICE_UNAVAILABLE, "confirmation_unavailable")
            }
            Self::ProtectedAuthenticationRequired => (
                StatusCode::PRECONDITION_REQUIRED,
                "protected_authentication_required",
            ),
            Self::TokenUnavailable => (StatusCode::SERVICE_UNAVAILABLE, "token_unavailable"),
            Self::Configuration(_) | Self::ProviderFailure | Self::UnsupportedPlatform => {
                (StatusCode::SERVICE_UNAVAILABLE, "agent_unavailable")
            }
        }
    }
}

impl IntoResponse for AgentError {
    fn into_response(self) -> Response {
        let (status, code) = self.status_and_code();
        let message = self.to_string();
        (
            status,
            Json(ErrorEnvelope {
                error: ErrorDetail { code, message },
            }),
        )
            .into_response()
    }
}
