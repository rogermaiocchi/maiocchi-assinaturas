import CryptoKit
import Foundation
import Security

struct TokenIdentity {
    let identity: SecIdentity
    let certificate: SecCertificate
    let privateKey: SecKey
    let descriptor: CertificateDescriptor
}

final class TokenIdentityStore: @unchecked Sendable {
    func list() throws -> [CertificateDescriptor] {
        try identities().map(\.descriptor).sorted { $0.subject < $1.subject }
    }

    func sign(_ data: Data, fingerprint: String) throws -> Data {
        guard let selected = try identities().first(where: {
            $0.descriptor.fingerprintSha256.caseInsensitiveCompare(fingerprint) == .orderedSame
        }) else {
            throw AgentError.certificateNotFound
        }
        let algorithm = SecKeyAlgorithm.rsaSignatureMessagePKCS1v15SHA256
        guard SecKeyIsAlgorithmSupported(selected.privateKey, .sign, algorithm) else {
            throw AgentError.unsupportedKey
        }
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(selected.privateKey, algorithm, data as CFData, &error) else {
            let message = error?.takeRetainedValue().localizedDescription ?? "Falha não especificada do token."
            throw AgentError.tokenFailure(message)
        }
        return signature as Data
    }

    private func identities() throws -> [TokenIdentity] {
        let query: [CFString: Any] = [
            kSecClass: kSecClassIdentity,
            kSecReturnRef: true,
            kSecMatchLimit: kSecMatchLimitAll
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return [] }
        guard status == errSecSuccess else {
            throw AgentError.tokenFailure(SecCopyErrorMessageString(status, nil) as String? ?? "Falha ao consultar o Keychain.")
        }
        let refs: [SecIdentity]
        if let values = result as? [SecIdentity] {
            refs = values
        } else if let value = result as! SecIdentity? {
            refs = [value]
        } else {
            return []
        }
        return refs.compactMap(identityModel)
    }

    private func identityModel(_ identity: SecIdentity) -> TokenIdentity? {
        var certificateRef: SecCertificate?
        var keyRef: SecKey?
        guard SecIdentityCopyCertificate(identity, &certificateRef) == errSecSuccess,
              SecIdentityCopyPrivateKey(identity, &keyRef) == errSecSuccess,
              let certificate = certificateRef,
              let privateKey = keyRef,
              let attributes = SecKeyCopyAttributes(privateKey) as? [CFString: Any],
              TokenKeyEvidence(attributes: attributes).isEligibleExternalTokenKey,
              SecKeyIsAlgorithmSupported(privateKey, .sign, .rsaSignatureMessagePKCS1v15SHA256) else {
            return nil
        }
        let evidence = TokenKeyEvidence(attributes: attributes)
        let der = SecCertificateCopyData(certificate) as Data
        let fingerprint = SHA256.hash(data: der).map { String(format: "%02x", $0) }.joined()
        let subject = SecCertificateCopySubjectSummary(certificate) as String? ?? "Certificado sem nome"
        let descriptor = CertificateDescriptor(
            fingerprintSha256: fingerprint,
            subject: subject,
            certificateBase64: der.base64EncodedString(),
            chainBase64: certificateChain(for: certificate),
            keyAlgorithm: "RSA",
            keySizeInBits: evidence.keySizeInBits,
            tokenBacked: true,
            keyOrigin: "CryptoTokenKit",
            trustClassification: "external-token-unverified"
        )
        return TokenIdentity(identity: identity, certificate: certificate, privateKey: privateKey, descriptor: descriptor)
    }

    private func certificateChain(for certificate: SecCertificate) -> [String] {
        var trustRef: SecTrust?
        guard SecTrustCreateWithCertificates(certificate, SecPolicyCreateBasicX509(), &trustRef) == errSecSuccess,
              let trust = trustRef else { return [] }
        SecTrustSetNetworkFetchAllowed(trust, true)
        _ = SecTrustEvaluateWithError(trust, nil)
        let evaluated = SecTrustCopyCertificateChain(trust) as? [SecCertificate] ?? []
        let chain = evaluated.count > 1 ? evaluated : buildChain(from: certificate, candidates: allCertificates())
        let leaf = SecCertificateCopyData(certificate) as Data
        return chain.dropFirst().compactMap { item in
            let data = SecCertificateCopyData(item) as Data
            return data == leaf ? nil : data.base64EncodedString()
        }
    }

    private func allCertificates() -> [SecCertificate] {
        let query: [CFString: Any] = [
            kSecClass: kSecClassCertificate,
            kSecReturnRef: true,
            kSecMatchLimit: kSecMatchLimitAll
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return [] }
        if let values = result as? [SecCertificate] { return values }
        if let value = result as! SecCertificate? { return [value] }
        return []
    }

    private func buildChain(from leaf: SecCertificate, candidates: [SecCertificate]) -> [SecCertificate] {
        var chain = [leaf]
        var current = leaf
        var seen = Set<Data>([SecCertificateCopyData(leaf) as Data])
        for _ in 0..<8 {
            guard let issuer = SecCertificateCopyNormalizedIssuerSequence(current) as Data?,
                  let parent = candidates.first(where: {
                      guard let subject = SecCertificateCopyNormalizedSubjectSequence($0) as Data? else { return false }
                      return subject == issuer && !seen.contains(SecCertificateCopyData($0) as Data)
                  }) else { break }
            let der = SecCertificateCopyData(parent) as Data
            chain.append(parent)
            seen.insert(der)
            current = parent
            if SecCertificateCopyNormalizedIssuerSequence(parent) as Data? == SecCertificateCopyNormalizedSubjectSequence(parent) as Data? { break }
        }
        return chain
    }
}
