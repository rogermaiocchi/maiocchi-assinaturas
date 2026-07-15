use std::{ffi::c_void, mem::size_of, ptr, slice};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use sha2::{Digest, Sha256};
use tracing::info;
use windows::{
    Win32::Security::{Cryptography::*, OBJECT_SECURITY_INFORMATION},
    core::{BOOL, w},
};
use x509_parser::{parse_x509_certificate, public_key::PublicKey};

use super::TokenProvider;
use crate::{
    error::AgentError,
    model::{
        CertificateDescriptor, EXTERNAL_TOKEN_TRUST_CLASSIFICATION, WINDOWS_SMART_CARD_KEY_ORIGIN,
    },
};

pub struct WindowsCngProvider;

impl WindowsCngProvider {
    pub fn new() -> Result<Self, AgentError> {
        Ok(Self)
    }
}

impl TokenProvider for WindowsCngProvider {
    fn provider_name(&self) -> &'static str {
        "Windows Certificate Store/CNG"
    }

    fn profile(&self) -> &'static str {
        "windows-native-cng"
    }

    fn token_policy(&self) -> &'static str {
        "cng-smartcard-rsa-2048-fail-closed"
    }

    fn list_certificates(&self) -> Result<Vec<CertificateDescriptor>, AgentError> {
        let mut descriptors = Vec::new();
        unsafe {
            let store =
                CertOpenSystemStoreW(None, w!("MY")).map_err(|_| AgentError::ProviderFailure)?;
            let mut context: *mut CERT_CONTEXT = ptr::null_mut();
            loop {
                context =
                    CertEnumCertificatesInStore(store, (!context.is_null()).then_some(context));
                if context.is_null() {
                    break;
                }
                if let Some(descriptor) = descriptor_for_context(context, true) {
                    descriptors.push(descriptor);
                }
            }
            CertCloseStore(Some(store), 0).map_err(|_| AgentError::ProviderFailure)?;
        }
        descriptors.sort_by(|left, right| left.subject.cmp(&right.subject));
        descriptors.dedup_by(|left, right| left.fingerprint_sha256 == right.fingerprint_sha256);
        Ok(descriptors)
    }

    fn sign(&self, data: &[u8], fingerprint_sha256: &str) -> Result<Vec<u8>, AgentError> {
        unsafe {
            let store =
                CertOpenSystemStoreW(None, w!("MY")).map_err(|_| AgentError::ProviderFailure)?;
            let mut context: *mut CERT_CONTEXT = ptr::null_mut();
            let mut selected: *mut CERT_CONTEXT = ptr::null_mut();
            loop {
                context =
                    CertEnumCertificatesInStore(store, (!context.is_null()).then_some(context));
                if context.is_null() {
                    break;
                }
                let Some(der) = context_der(context) else {
                    continue;
                };
                if hex_sha256(der) == fingerprint_sha256
                    && descriptor_for_context(context, true).is_some()
                {
                    selected = CertDuplicateCertificateContext(Some(context));
                    break;
                }
            }
            if !context.is_null() {
                let _ = CertFreeCertificateContext(Some(context));
            }
            CertCloseStore(Some(store), 0).map_err(|_| AgentError::ProviderFailure)?;
            if selected.is_null() {
                return Err(AgentError::CertificateNotFound);
            }

            let result = sign_with_context(selected, data);
            let _ = CertFreeCertificateContext(Some(selected));
            if result.is_ok() {
                info!("External-token signing operation completed through Windows CNG");
            }
            result
        }
    }
}

unsafe fn descriptor_for_context(
    context: *const CERT_CONTEXT,
    silent: bool,
) -> Option<CertificateDescriptor> {
    let der = unsafe { context_der(context)? };
    let (_, certificate) = parse_x509_certificate(der).ok()?;
    if !certificate.validity().is_valid() {
        return None;
    }
    if matches!(certificate.key_usage(), Ok(Some(usage)) if !usage.value.digital_signature()) {
        return None;
    }
    let PublicKey::RSA(rsa) = certificate.public_key().parsed().ok()? else {
        return None;
    };
    let key_size_in_bits = rsa.key_size();
    if key_size_in_bits < 2048 {
        return None;
    }

    let acquired = unsafe { acquire_cng_key(context, silent).ok()? };
    if !unsafe { external_smart_card_backed(acquired.key) }
        || unsafe { key_length(acquired.key) } < 2048
    {
        unsafe { acquired.free() };
        return None;
    }
    unsafe { acquired.free() };

    Some(CertificateDescriptor {
        fingerprint_sha256: hex_sha256(der),
        subject: certificate.subject().to_string(),
        certificate_base64: STANDARD.encode(der),
        chain_base64: unsafe { certificate_chain(context) },
        key_algorithm: "RSA",
        key_size_in_bits,
        token_backed: true,
        key_origin: WINDOWS_SMART_CARD_KEY_ORIGIN,
        trust_classification: EXTERNAL_TOKEN_TRUST_CLASSIFICATION,
    })
}

unsafe fn context_der<'a>(context: *const CERT_CONTEXT) -> Option<&'a [u8]> {
    if context.is_null()
        || unsafe { (*context).pbCertEncoded.is_null() }
        || unsafe { (*context).cbCertEncoded } == 0
    {
        return None;
    }
    Some(unsafe {
        slice::from_raw_parts((*context).pbCertEncoded, (*context).cbCertEncoded as usize)
    })
}

struct AcquiredKey {
    key: NCRYPT_KEY_HANDLE,
    caller_must_free: bool,
}

impl AcquiredKey {
    unsafe fn free(self) {
        if self.caller_must_free {
            let _ = unsafe { NCryptFreeObject(NCRYPT_HANDLE(self.key.0)) };
        }
    }
}

unsafe fn acquire_cng_key(
    context: *const CERT_CONTEXT,
    silent: bool,
) -> Result<AcquiredKey, AgentError> {
    let mut raw_handle = HCRYPTPROV_OR_NCRYPT_KEY_HANDLE::default();
    let mut key_spec = CERT_KEY_SPEC::default();
    let mut caller_free = BOOL::default();
    let mut flags = CRYPT_ACQUIRE_ONLY_NCRYPT_KEY_FLAG | CRYPT_ACQUIRE_COMPARE_KEY_FLAG;
    if silent {
        flags |= CRYPT_ACQUIRE_SILENT_FLAG;
    }
    unsafe {
        CryptAcquireCertificatePrivateKey(
            context,
            flags,
            None,
            &mut raw_handle,
            Some(&mut key_spec),
            Some(&mut caller_free),
        )
    }
    .map_err(|_| AgentError::ProviderFailure)?;
    if key_spec != CERT_NCRYPT_KEY_SPEC || raw_handle.0 == 0 {
        return Err(AgentError::UnsupportedKey);
    }
    Ok(AcquiredKey {
        key: NCRYPT_KEY_HANDLE(raw_handle.0),
        caller_must_free: caller_free.as_bool(),
    })
}

unsafe fn hardware_backed(key: NCRYPT_KEY_HANDLE) -> bool {
    unsafe { ncrypt_u32_property(key, NCRYPT_IMPL_TYPE_PROPERTY) }
        .map(|flags| flags & NCRYPT_IMPL_HARDWARE_FLAG != 0)
        .unwrap_or(false)
}

unsafe fn external_smart_card_backed(key: NCRYPT_KEY_HANDLE) -> bool {
    if !unsafe { hardware_backed(key) } {
        return false;
    }
    let reader = unsafe { ncrypt_property(key, NCRYPT_READER_PROPERTY) }
        .map(|bytes| {
            bytes
                .chunks_exact(2)
                .any(|unit| u16::from_le_bytes([unit[0], unit[1]]) != 0)
        })
        .unwrap_or(false);
    let smart_card_guid = unsafe { ncrypt_property(key, NCRYPT_SMARTCARD_GUID_PROPERTY) }
        .map(|bytes| bytes.iter().any(|byte| *byte != 0))
        .unwrap_or(false);
    reader || smart_card_guid
}

unsafe fn key_length(key: NCRYPT_KEY_HANDLE) -> usize {
    unsafe { ncrypt_u32_property(key, NCRYPT_LENGTH_PROPERTY) }.unwrap_or(0) as usize
}

unsafe fn ncrypt_u32_property(
    key: NCRYPT_KEY_HANDLE,
    property: windows::core::PCWSTR,
) -> Option<u32> {
    let mut output = [0u8; size_of::<u32>()];
    let mut written = 0u32;
    unsafe {
        NCryptGetProperty(
            NCRYPT_HANDLE(key.0),
            property,
            Some(&mut output),
            &mut written,
            OBJECT_SECURITY_INFORMATION(0),
        )
    }
    .ok()?;
    (written as usize == output.len()).then(|| u32::from_ne_bytes(output))
}

unsafe fn ncrypt_property(
    key: NCRYPT_KEY_HANDLE,
    property: windows::core::PCWSTR,
) -> Option<Vec<u8>> {
    let mut size = 0u32;
    unsafe {
        NCryptGetProperty(
            NCRYPT_HANDLE(key.0),
            property,
            None,
            &mut size,
            OBJECT_SECURITY_INFORMATION(0),
        )
    }
    .ok()?;
    if size == 0 || size > 4096 {
        return None;
    }
    let mut output = vec![0u8; size as usize];
    let mut written = 0u32;
    unsafe {
        NCryptGetProperty(
            NCRYPT_HANDLE(key.0),
            property,
            Some(&mut output),
            &mut written,
            OBJECT_SECURITY_INFORMATION(0),
        )
    }
    .ok()?;
    if written == 0 || written > size {
        return None;
    }
    output.truncate(written as usize);
    Some(output)
}

unsafe fn sign_with_context(
    context: *const CERT_CONTEXT,
    data: &[u8],
) -> Result<Vec<u8>, AgentError> {
    let acquired = unsafe { acquire_cng_key(context, false)? };
    if !unsafe { external_smart_card_backed(acquired.key) }
        || unsafe { key_length(acquired.key) } < 2048
    {
        unsafe { acquired.free() };
        return Err(AgentError::UnsupportedKey);
    }
    let hash = Sha256::digest(data);
    let padding = BCRYPT_PKCS1_PADDING_INFO {
        pszAlgId: BCRYPT_SHA256_ALGORITHM,
    };
    let padding_ptr = &padding as *const BCRYPT_PKCS1_PADDING_INFO as *const c_void;
    let mut signature_size = 0u32;
    let size_result = unsafe {
        NCryptSignHash(
            acquired.key,
            Some(padding_ptr),
            hash.as_slice(),
            None,
            &mut signature_size,
            NCRYPT_PAD_PKCS1_FLAG,
        )
    };
    if size_result.is_err() || signature_size == 0 || signature_size > 16 * 1024 {
        unsafe { acquired.free() };
        return Err(AgentError::ProviderFailure);
    }
    let mut signature = vec![0u8; signature_size as usize];
    let sign_result = unsafe {
        NCryptSignHash(
            acquired.key,
            Some(padding_ptr),
            hash.as_slice(),
            Some(&mut signature),
            &mut signature_size,
            NCRYPT_PAD_PKCS1_FLAG,
        )
    };
    unsafe { acquired.free() };
    sign_result.map_err(|_| AgentError::ProviderFailure)?;
    signature.truncate(signature_size as usize);
    Ok(signature)
}

unsafe fn certificate_chain(context: *const CERT_CONTEXT) -> Vec<String> {
    let parameters = CERT_CHAIN_PARA {
        cbSize: size_of::<CERT_CHAIN_PARA>() as u32,
        ..Default::default()
    };
    let mut chain_context: *mut CERT_CHAIN_CONTEXT = ptr::null_mut();
    if unsafe {
        CertGetCertificateChain(
            None,
            context,
            None,
            None,
            &parameters,
            0,
            None,
            &mut chain_context,
        )
    }
    .is_err()
        || chain_context.is_null()
    {
        return Vec::new();
    }

    let mut chain = Vec::new();
    unsafe {
        let selected = &*chain_context;
        if selected.cChain > 0 && !selected.rgpChain.is_null() {
            let simple = *selected.rgpChain;
            if !simple.is_null() {
                for index in 1..(*simple).cElement as usize {
                    let element = *(*simple).rgpElement.add(index);
                    if element.is_null() {
                        continue;
                    }
                    if let Some(der) = context_der((*element).pCertContext) {
                        chain.push(STANDARD.encode(der));
                    }
                }
            }
        }
        CertFreeCertificateChain(chain_context);
    }
    chain
}

fn hex_sha256(value: &[u8]) -> String {
    Sha256::digest(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
