use std::sync::Arc;

use crate::{error::AgentError, model::CertificateDescriptor};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

pub trait TokenProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn profile(&self) -> &'static str;
    fn token_policy(&self) -> &'static str;
    fn list_certificates(&self) -> Result<Vec<CertificateDescriptor>, AgentError>;
    fn sign(&self, data: &[u8], fingerprint_sha256: &str) -> Result<Vec<u8>, AgentError>;
}

pub fn platform_provider() -> Result<Arc<dyn TokenProvider>, AgentError> {
    #[cfg(target_os = "linux")]
    {
        return Ok(Arc::new(linux::LinuxPkcs11Provider::new()?));
    }
    #[cfg(target_os = "windows")]
    {
        return Ok(Arc::new(windows::WindowsCngProvider::new()?));
    }
    #[allow(unreachable_code)]
    Err(AgentError::UnsupportedPlatform)
}
