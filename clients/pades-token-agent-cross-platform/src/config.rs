use std::{collections::HashSet, env, net::SocketAddr, path::PathBuf, sync::Arc};

use url::Url;

use crate::error::AgentError;

pub const LOOPBACK_ADDRESS: &str = "127.0.0.1:35100";

#[derive(Clone, Debug)]
pub struct AgentConfig {
    pub bind_address: SocketAddr,
    pub portal_origin: String,
    pub allowed_origins: Arc<HashSet<String>>,
    pub replay_store_path: PathBuf,
}

impl AgentConfig {
    pub fn from_environment() -> Result<Self, AgentError> {
        let portal_origin = env::var("MAIOCCHI_PORTAL_ORIGIN")
            .unwrap_or_else(|_| "https://assinatura.maiocchi.adv.br".to_owned());
        validate_origin(&portal_origin)?;

        let configured_origins = env::var("MAIOCCHI_ALLOWED_ORIGINS").ok();
        let allowed_origins = allowed_origins(&portal_origin, configured_origins.as_deref())?;
        let replay_store_path = replay_store_path(env::var("MAIOCCHI_REPLAY_STORE_PATH").ok())?;

        Ok(Self {
            bind_address: LOOPBACK_ADDRESS
                .parse()
                .map_err(|_| AgentError::Configuration("Endereço loopback inválido.".to_owned()))?,
            portal_origin,
            allowed_origins: Arc::new(allowed_origins),
            replay_store_path,
        })
    }
}

fn allowed_origins(
    portal_origin: &str,
    configured: Option<&str>,
) -> Result<HashSet<String>, AgentError> {
    let values = configured
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_else(|| {
            vec![
                portal_origin,
                "chrome-extension://cbikodnffamnfjoaobfpacilcfilmjlh",
                "http://127.0.0.1:35100",
            ]
        });
    if values.is_empty() {
        return Err(AgentError::Configuration(
            "Ao menos uma origem autorizada deve ser configurada.".to_owned(),
        ));
    }
    values
        .into_iter()
        .map(|origin| {
            validate_origin(origin)?;
            Ok(origin.to_owned())
        })
        .collect()
}

fn replay_store_path(configured: Option<String>) -> Result<PathBuf, AgentError> {
    if let Some(value) = configured {
        let path = PathBuf::from(value.trim());
        if !path.is_absolute() {
            return Err(AgentError::Configuration(
                "O registro de replay deve usar caminho absoluto.".to_owned(),
            ));
        }
        return Ok(path);
    }

    #[cfg(target_os = "windows")]
    let root = env::var_os("LOCALAPPDATA").map(PathBuf::from);
    #[cfg(not(target_os = "windows"))]
    let root = env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/state")));

    root.map(|path| path.join("maiocchi-pades-token-agent/replay.jsonl"))
        .ok_or_else(|| {
            AgentError::Configuration("Diretório local de estado indisponível.".to_owned())
        })
}

fn validate_origin(value: &str) -> Result<(), AgentError> {
    let url = Url::parse(value)
        .map_err(|_| AgentError::Configuration("Origem autorizada inválida.".to_owned()))?;
    let is_http = matches!(url.scheme(), "http" | "https" | "chrome-extension");
    if !is_http
        || url.host_str().is_none()
        || !matches!(url.path(), "" | "/")
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AgentError::Configuration(
            "A origem deve conter apenas esquema e host.".to_owned(),
        ));
    }
    if url.scheme() == "http" && !matches!(url.host_str(), Some("127.0.0.1" | "localhost")) {
        return Err(AgentError::Configuration(
            "HTTP só é aceito no loopback.".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{AgentConfig, allowed_origins, validate_origin};

    #[test]
    fn accepts_https_and_loopback_origins() {
        assert!(validate_origin("https://assinatura.maiocchi.adv.br").is_ok());
        assert!(validate_origin("http://127.0.0.1:35100").is_ok());
        assert!(validate_origin("chrome-extension://abcdefghijklmnop").is_ok());
    }

    #[test]
    fn rejects_paths_credentials_and_remote_http() {
        assert!(validate_origin("https://example.test/path").is_err());
        assert!(validate_origin("https://user@example.test").is_err());
        assert!(validate_origin("http://example.test").is_err());
    }

    #[test]
    fn includes_the_pinned_extension_origin_by_default() {
        let config = AgentConfig::from_environment().expect("default config");
        assert!(
            config
                .allowed_origins
                .contains("chrome-extension://cbikodnffamnfjoaobfpacilcfilmjlh")
        );
    }

    #[test]
    fn configured_allowlist_replaces_the_defaults() {
        let origins = allowed_origins(
            "https://assinatura.maiocchi.adv.br",
            Some("https://custom.example"),
        )
        .expect("custom allowlist");
        assert_eq!(origins.len(), 1);
        assert!(origins.contains("https://custom.example"));
        assert!(!origins.contains("https://assinatura.maiocchi.adv.br"));
    }
}
