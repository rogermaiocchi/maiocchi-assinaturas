use base64::{Engine as _, engine::general_purpose::STANDARD};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AgentError;

pub const EXTERNAL_TOKEN_TRUST_CLASSIFICATION: &str = "external-token-verified";
pub const WINDOWS_SMART_CARD_KEY_ORIGIN: &str = "Windows-CNG-SmartCard";
pub const LINUX_REMOVABLE_KEY_ORIGIN: &str = "PKCS11-removable-hardware";

pub fn accepted_external_token_origins() -> [&'static str; 2] {
    [WINDOWS_SMART_CARD_KEY_ORIGIN, LINUX_REMOVABLE_KEY_ORIGIN]
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub status: &'static str,
    pub version: &'static str,
    pub provider: &'static str,
    pub architecture: &'static str,
    pub profile: &'static str,
    pub token_policy: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateDescriptor {
    pub fingerprint_sha256: String,
    pub subject: String,
    pub certificate_base64: String,
    pub chain_base64: Vec<String>,
    pub key_algorithm: &'static str,
    pub key_size_in_bits: usize,
    pub token_backed: bool,
    pub key_origin: &'static str,
    pub trust_classification: &'static str,
}

#[derive(Debug, Serialize)]
pub struct CertificateList {
    pub certificates: Vec<CertificateDescriptor>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SignRequest {
    pub session_id: String,
    pub data_to_sign_base64: String,
    pub digest_algorithm: String,
    pub signature_algorithm: String,
    pub certificate_fingerprint_sha256: String,
    pub document_sha256: String,
    pub document_name: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct ValidatedSignRequest {
    pub session_id: String,
    pub data_to_sign: Vec<u8>,
    pub certificate_fingerprint_sha256: String,
    pub document_sha256: String,
    pub document_name: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignResponse {
    pub session_id: String,
    pub signature_base64: String,
    pub certificate_fingerprint_sha256: String,
}

impl SignRequest {
    pub fn validate(self, now: DateTime<Utc>) -> Result<ValidatedSignRequest, AgentError> {
        if Uuid::parse_str(&self.session_id).is_err()
            || self.digest_algorithm != "SHA-256"
            || self.signature_algorithm != "RSA-SHA256"
            || !is_lower_hex_sha256(&self.document_sha256)
            || !is_lower_hex_sha256(&self.certificate_fingerprint_sha256)
            || self.expires_at <= now
            || self.expires_at > now + Duration::seconds(190)
            || self.document_name.is_empty()
            || self.document_name.chars().count() > 255
            || self.document_name.chars().any(char::is_control)
        {
            return Err(AgentError::InvalidRequest(
                "Tarefa de assinatura inválida ou expirada.".to_owned(),
            ));
        }

        let data_to_sign = STANDARD
            .decode(self.data_to_sign_base64.as_bytes())
            .map_err(|_| {
                AgentError::InvalidRequest("Conteúdo criptográfico inválido.".to_owned())
            })?;
        if data_to_sign.is_empty() || data_to_sign.len() > 1024 * 1024 {
            return Err(AgentError::InvalidRequest(
                "Conteúdo criptográfico fora do limite.".to_owned(),
            ));
        }

        Ok(ValidatedSignRequest {
            session_id: self.session_id,
            data_to_sign,
            certificate_fingerprint_sha256: self.certificate_fingerprint_sha256,
            document_sha256: self.document_sha256,
            document_name: self.document_name,
            expires_at: self.expires_at,
        })
    }
}

pub fn is_lower_hex_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
mod tests {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use chrono::{Duration, Utc};

    use super::{SignRequest, is_lower_hex_sha256};

    fn request(now: chrono::DateTime<Utc>) -> SignRequest {
        SignRequest {
            session_id: "1ed95b77-cf5c-47e7-bc0e-dc3f3e7a4a8f".to_owned(),
            data_to_sign_base64: STANDARD.encode(b"signed-attributes"),
            digest_algorithm: "SHA-256".to_owned(),
            signature_algorithm: "RSA-SHA256".to_owned(),
            certificate_fingerprint_sha256: "a".repeat(64),
            document_sha256: "b".repeat(64),
            document_name: "documento.pdf".to_owned(),
            expires_at: now + Duration::seconds(120),
        }
    }

    #[test]
    fn validates_bound_short_lived_request() {
        let now = Utc::now();
        assert!(request(now).validate(now).is_ok());
    }

    #[test]
    fn rejects_replay_window_and_noncanonical_hashes() {
        let now = Utc::now();
        let mut expired = request(now);
        expired.expires_at = now;
        assert!(expired.validate(now).is_err());

        let mut uppercase = request(now);
        uppercase.document_sha256 = "A".repeat(64);
        assert!(uppercase.validate(now).is_err());
        assert!(!is_lower_hex_sha256(&"A".repeat(64)));
    }
}
