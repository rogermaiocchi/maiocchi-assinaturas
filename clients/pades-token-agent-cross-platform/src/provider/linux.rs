use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use cryptoki::{
    context::{CInitializeArgs, CInitializeFlags, Pkcs11},
    error::{Error as Pkcs11Error, RvError},
    mechanism::{Mechanism, MechanismType},
    object::{Attribute, AttributeType, CertificateType, KeyType, ObjectClass},
    session::{Session, UserType},
    slot::Slot,
};
use sha2::{Digest, Sha256};
use tracing::{info, warn};
use x509_parser::{parse_x509_certificate, public_key::PublicKey};

use super::TokenProvider;
use crate::{
    error::AgentError,
    model::{
        CertificateDescriptor, EXTERNAL_TOKEN_TRUST_CLASSIFICATION, LINUX_REMOVABLE_KEY_ORIGIN,
    },
};

pub struct LinuxPkcs11Provider {
    module_paths: Vec<PathBuf>,
}

impl LinuxPkcs11Provider {
    pub fn new() -> Result<Self, AgentError> {
        let module_paths = discover_modules();
        if module_paths.is_empty() {
            warn!("No configured p11-kit or PKCS#11 module was found");
        }
        Ok(Self { module_paths })
    }

    fn for_each_context<T>(&self, mut operation: impl FnMut(&Pkcs11, &Path) -> Vec<T>) -> Vec<T> {
        let mut values = Vec::new();
        for module_path in &self.module_paths {
            let Ok(context) = Pkcs11::new(module_path) else {
                warn!(module = %module_path.display(), "PKCS#11 module could not be loaded");
                continue;
            };
            let initialized_here = match context
                .initialize(CInitializeArgs::new(CInitializeFlags::OS_LOCKING_OK))
            {
                Ok(()) => true,
                Err(Pkcs11Error::Pkcs11(RvError::CryptokiAlreadyInitialized, _)) => false,
                Err(_) => {
                    warn!(module = %module_path.display(), "PKCS#11 module could not be initialized");
                    continue;
                }
            };
            values.extend(operation(&context, module_path));
            if initialized_here {
                let _ = context.finalize();
            }
        }
        values
    }

    fn sign_in_context(
        context: &Pkcs11,
        data: &[u8],
        fingerprint_sha256: &str,
    ) -> Result<Option<Vec<u8>>, AgentError> {
        for slot in context
            .get_slots_with_token()
            .map_err(|_| AgentError::ProviderFailure)?
        {
            if !external_token_slot(context, slot) {
                continue;
            }
            if !context
                .get_mechanism_list(slot)
                .map_err(|_| AgentError::ProviderFailure)?
                .contains(&MechanismType::SHA256_RSA_PKCS)
            {
                continue;
            }
            let token_info = context
                .get_token_info(slot)
                .map_err(|_| AgentError::ProviderFailure)?;
            let session = context
                .open_ro_session(slot)
                .map_err(|_| AgentError::ProviderFailure)?;
            let records = certificate_records(&session, slot)?;
            let Some(record) = records
                .into_iter()
                .find(|item| item.fingerprint_sha256 == fingerprint_sha256)
            else {
                continue;
            };

            if token_info.login_required() {
                if !token_info.protected_authentication_path() {
                    return Err(AgentError::ProtectedAuthenticationRequired);
                }
                match session.login(UserType::User, None) {
                    Ok(()) | Err(Pkcs11Error::Pkcs11(RvError::UserAlreadyLoggedIn, _)) => {}
                    Err(_) => return Err(AgentError::ProviderFailure),
                }
            }

            let keys = matching_private_keys(&session, &record.id)?;
            let Some(key) = keys.first().copied() else {
                return Err(AgentError::CertificateNotFound);
            };
            let signature = session
                .sign(&Mechanism::Sha256RsaPkcs, key, data)
                .map_err(|_| AgentError::ProviderFailure)?;
            return Ok(Some(signature));
        }
        Ok(None)
    }
}

fn external_token_slot(context: &Pkcs11, slot: Slot) -> bool {
    let Ok(slot_info) = context.get_slot_info(slot) else {
        return false;
    };
    let Ok(token_info) = context.get_token_info(slot) else {
        return false;
    };
    slot_info.hardware_slot()
        && slot_info.removable_device()
        && token_info.login_required()
        && token_info.protected_authentication_path()
}

impl TokenProvider for LinuxPkcs11Provider {
    fn provider_name(&self) -> &'static str {
        "p11-kit/PKCS#11"
    }

    fn profile(&self) -> &'static str {
        "linux-native-pkcs11"
    }

    fn token_policy(&self) -> &'static str {
        "removable-hardware-token-rsa-2048-protected-auth-fail-closed"
    }

    fn list_certificates(&self) -> Result<Vec<CertificateDescriptor>, AgentError> {
        let mut descriptors = self.for_each_context(|context, module_path| {
            let mut values = Vec::new();
            let Ok(slots) = context.get_slots_with_token() else { return values };
            for slot in slots {
                if !external_token_slot(context, slot) { continue; }
                let Ok(mechanisms) = context.get_mechanism_list(slot) else { continue };
                if !mechanisms.contains(&MechanismType::SHA256_RSA_PKCS) { continue; }
                let Ok(session) = context.open_ro_session(slot) else { continue };
                match certificate_records(&session, slot) {
                    Ok(records) => values.extend(records.into_iter().map(|record| record.descriptor)),
                    Err(_) => warn!(module = %module_path.display(), slot = slot.id(), "Token slot could not be enumerated"),
                }
            }
            values
        });
        descriptors.sort_by(|left, right| left.subject.cmp(&right.subject));
        descriptors.dedup_by(|left, right| left.fingerprint_sha256 == right.fingerprint_sha256);
        Ok(descriptors)
    }

    fn sign(&self, data: &[u8], fingerprint_sha256: &str) -> Result<Vec<u8>, AgentError> {
        for module_path in &self.module_paths {
            let context = match Pkcs11::new(module_path) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let initialized_here =
                match context.initialize(CInitializeArgs::new(CInitializeFlags::OS_LOCKING_OK)) {
                    Ok(()) => true,
                    Err(Pkcs11Error::Pkcs11(RvError::CryptokiAlreadyInitialized, _)) => false,
                    Err(_) => continue,
                };
            let result = Self::sign_in_context(&context, data, fingerprint_sha256);
            if initialized_here {
                let _ = context.finalize();
            }
            match result {
                Ok(Some(signature)) => {
                    info!("External-token signing operation completed through p11-kit");
                    return Ok(signature);
                }
                Ok(None) => continue,
                Err(error) => return Err(error),
            }
        }
        Err(if self.module_paths.is_empty() {
            AgentError::TokenUnavailable
        } else {
            AgentError::CertificateNotFound
        })
    }
}

struct CertificateRecord {
    id: Vec<u8>,
    fingerprint_sha256: String,
    descriptor: CertificateDescriptor,
}

fn certificate_records(
    session: &Session,
    _slot: Slot,
) -> Result<Vec<CertificateRecord>, AgentError> {
    let handles = session
        .find_objects(&[
            Attribute::Class(ObjectClass::CERTIFICATE),
            Attribute::CertificateType(CertificateType::X_509),
            Attribute::Token(true),
        ])
        .map_err(|_| AgentError::ProviderFailure)?;
    let mut raw_records = Vec::new();
    for handle in handles {
        let Ok(attributes) =
            session.get_attributes(handle, &[AttributeType::Value, AttributeType::Id])
        else {
            continue;
        };
        let mut der = None;
        let mut id = None;
        for attribute in attributes {
            match attribute {
                Attribute::Value(value) => der = Some(value),
                Attribute::Id(value) => id = Some(value),
                _ => {}
            }
        }
        let (Some(der), Some(id)) = (der, id) else {
            continue;
        };
        raw_records.push((id, der));
    }

    let all_certificates: Vec<Vec<u8>> = raw_records.iter().map(|(_, der)| der.clone()).collect();
    let mut records = Vec::new();
    for (id, der) in raw_records {
        let Ok((_, certificate)) = parse_x509_certificate(&der) else {
            continue;
        };
        if !certificate.validity().is_valid() {
            continue;
        }
        if matches!(certificate.key_usage(), Ok(Some(usage)) if !usage.value.digital_signature()) {
            continue;
        }
        let Ok(PublicKey::RSA(rsa)) = certificate.public_key().parsed() else {
            continue;
        };
        let key_size_in_bits = rsa.key_size();
        if key_size_in_bits < 2048 || matching_private_keys(session, &id)?.is_empty() {
            continue;
        }

        let fingerprint_sha256 = hex_sha256(&der);
        let chain_base64 = build_chain(&der, &all_certificates)
            .into_iter()
            .map(|value| STANDARD.encode(value))
            .collect();
        records.push(CertificateRecord {
            id,
            fingerprint_sha256: fingerprint_sha256.clone(),
            descriptor: CertificateDescriptor {
                fingerprint_sha256,
                subject: certificate.subject().to_string(),
                certificate_base64: STANDARD.encode(&der),
                chain_base64,
                key_algorithm: "RSA",
                key_size_in_bits,
                token_backed: true,
                key_origin: LINUX_REMOVABLE_KEY_ORIGIN,
                trust_classification: EXTERNAL_TOKEN_TRUST_CLASSIFICATION,
            },
        });
    }
    Ok(records)
}

fn matching_private_keys(
    session: &Session,
    id: &[u8],
) -> Result<Vec<cryptoki::object::ObjectHandle>, AgentError> {
    session
        .find_objects(&[
            Attribute::Class(ObjectClass::PRIVATE_KEY),
            Attribute::KeyType(KeyType::RSA),
            Attribute::Id(id.to_vec()),
            Attribute::Sign(true),
            Attribute::Token(true),
        ])
        .map_err(|_| AgentError::ProviderFailure)
}

fn build_chain(leaf_der: &[u8], candidates: &[Vec<u8>]) -> Vec<Vec<u8>> {
    let mut chain = Vec::new();
    let mut current = leaf_der.to_vec();
    let mut seen = HashSet::from([hex_sha256(leaf_der)]);
    for _ in 0..8 {
        let Ok((_, certificate)) = parse_x509_certificate(&current) else {
            break;
        };
        if certificate.issuer().as_raw() == certificate.subject().as_raw() {
            break;
        }
        let Some(parent) = candidates.iter().find(|candidate| {
            let fingerprint = hex_sha256(candidate);
            if seen.contains(&fingerprint) {
                return false;
            }
            parse_x509_certificate(candidate)
                .map(|(_, parsed)| parsed.subject().as_raw() == certificate.issuer().as_raw())
                .unwrap_or(false)
        }) else {
            break;
        };
        seen.insert(hex_sha256(parent));
        current = parent.clone();
        chain.push(parent.clone());
    }
    chain
}

fn hex_sha256(value: &[u8]) -> String {
    Sha256::digest(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn discover_modules() -> Vec<PathBuf> {
    if let Ok(value) = env::var("MAIOCCHI_PKCS11_MODULES") {
        let explicit = env::split_paths(&value)
            .filter(|path| path.is_file())
            .collect::<Vec<_>>();
        if !explicit.is_empty() {
            return canonical_unique(explicit);
        }
    }

    let proxy_candidates = [
        "/usr/lib/x86_64-linux-gnu/p11-kit-proxy.so",
        "/usr/lib/aarch64-linux-gnu/p11-kit-proxy.so",
        "/usr/lib64/p11-kit-proxy.so",
        "/usr/lib/p11-kit-proxy.so",
        "/usr/lib/pkcs11/p11-kit-proxy.so",
    ];
    if let Some(proxy) = proxy_candidates
        .iter()
        .map(PathBuf::from)
        .find(|path| path.is_file())
    {
        return canonical_unique(vec![proxy]);
    }

    let mut config_directories = vec![
        PathBuf::from("/etc/pkcs11/modules"),
        PathBuf::from("/usr/share/p11-kit/modules"),
        PathBuf::from("/usr/local/share/p11-kit/modules"),
    ];
    if let Some(home) = env::var_os("HOME") {
        config_directories.push(PathBuf::from(home).join(".config/pkcs11/modules"));
    }
    if let Some(config_home) = env::var_os("XDG_CONFIG_HOME") {
        config_directories.push(PathBuf::from(config_home).join("pkcs11/modules"));
    }

    let mut values = Vec::new();
    for directory in config_directories {
        let Ok(entries) = fs::read_dir(directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("module") {
                continue;
            }
            let Ok(content) = fs::read_to_string(path) else {
                continue;
            };
            let Some(module) = content.lines().find_map(|line| {
                let line = line.trim();
                (!line.starts_with('#'))
                    .then(|| line.strip_prefix("module:").map(str::trim))
                    .flatten()
            }) else {
                continue;
            };
            if module.is_empty() || module.contains("p11-kit-trust") {
                continue;
            }
            let module_path = PathBuf::from(module);
            if module_path.is_absolute() && module_path.is_file() {
                values.push(module_path);
            } else if let Some(resolved) = resolve_relative_module(&module_path) {
                values.push(resolved);
            }
        }
    }
    canonical_unique(values)
}

fn resolve_relative_module(module: &Path) -> Option<PathBuf> {
    [
        "/usr/lib/x86_64-linux-gnu/pkcs11",
        "/usr/lib/aarch64-linux-gnu/pkcs11",
        "/usr/lib64/pkcs11",
        "/usr/lib/pkcs11",
        "/usr/local/lib/pkcs11",
    ]
    .into_iter()
    .map(PathBuf::from)
    .map(|directory| directory.join(module))
    .find(|path| path.is_file())
}

fn canonical_unique(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{build_chain, canonical_unique, discover_modules, hex_sha256};

    #[test]
    fn hashes_are_lowercase_and_canonical() {
        assert_eq!(
            hex_sha256(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn module_discovery_is_deduplicated_and_nonfatal() {
        let paths = discover_modules();
        assert_eq!(paths, canonical_unique(paths.clone()));
    }

    #[test]
    fn invalid_certificate_does_not_build_a_chain() {
        assert!(build_chain(b"not-a-certificate", &[]).is_empty());
    }
}
