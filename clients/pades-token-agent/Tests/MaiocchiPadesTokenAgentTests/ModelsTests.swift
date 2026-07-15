import Foundation
import Security
import Testing
@testable import MaiocchiPadesTokenAgent

@Test func signRequestRoundTripPreservesCryptographicFields() throws {
    let original = SignRequest(
        sessionId: "3bd4615d-5d09-4b7a-a6b8-27f2b329cb19",
        dataToSignBase64: Data("dtbs".utf8).base64EncodedString(),
        digestAlgorithm: "SHA-256",
        signatureAlgorithm: "RSA-SHA256",
        certificateFingerprintSha256: String(repeating: "a", count: 64),
        documentSha256: String(repeating: "b", count: 64),
        documentName: "contrato.pdf",
        expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
    )
    let decoded = try JSONDecoder().decode(SignRequest.self, from: JSONEncoder().encode(original))
    #expect(decoded.sessionId == original.sessionId)
    #expect(decoded.dataToSignBase64 == original.dataToSignBase64)
    #expect(decoded.documentSha256 == original.documentSha256)
    #expect(decoded.certificateFingerprintSha256 == original.certificateFingerprintSha256)
}

@Test func authorizationPageKeepsTicketInFragmentAndUsesRestrictedEndpoints() {
    #expect(AuthorizationPage.html.contains("/v1/authorize.js"))
    #expect(AuthorizationPage.javascript.contains("location.hash.slice(1)"))
    #expect(AuthorizationPage.javascript.contains("/api/pades/prepare"))
    #expect(AuthorizationPage.javascript.contains("prepared.sourceDocumentSha256 !== ticket.documentSha256"))
    #expect(AuthorizationPage.javascript.contains("prepared.documentSha256 !== prepared.presentationSha256"))
    #expect(AuthorizationPage.javascript.contains("['pending', 'prepared'].includes(ticket.status)"))
    #expect(AuthorizationPage.javascript.contains("Assinatura preparada e vinculada ao documento"))
    #expect(AuthorizationPage.javascript.contains("certificate.tokenBacked === true"))
    #expect(AuthorizationPage.javascript.contains("certificate.keyOrigin === 'CryptoTokenKit'"))
    #expect(AuthorizationPage.javascript.contains("certificate.trustClassification === 'external-token-unverified'"))
    #expect(AuthorizationPage.html.contains("A conformidade ICP-Brasil será confirmada pelo servidor"))
    #expect(AuthorizationPage.javascript.contains("Conformidade ICP-Brasil confirmada pelo servidor"))
    #expect(!AuthorizationPage.html.contains("ticket="))
}

@Test func externalRsaPrivateKeyIsEligibleForLocalTokenUse() {
    let evidence = TokenKeyEvidence(
        tokenBacked: true,
        secureEnclave: false,
        privateKey: true,
        rsa: true,
        canSign: true,
        keySizeInBits: 2048
    )
    #expect(evidence.isEligibleExternalTokenKey)
}

@Test func securityFrameworkAttributesProduceTokenBackedEvidence() {
    let attributes: [CFString: Any] = [
        kSecAttrTokenID: "br.adv.maiocchi.test.external-token",
        kSecAttrKeyClass: kSecAttrKeyClassPrivate,
        kSecAttrKeyType: kSecAttrKeyTypeRSA,
        kSecAttrCanSign: true,
        kSecAttrKeySizeInBits: 2048
    ]
    let evidence = TokenKeyEvidence(attributes: attributes)
    #expect(evidence.tokenBacked)
    #expect(!evidence.secureEnclave)
    #expect(evidence.isEligibleExternalTokenKey)
}

@Test func softwareKeyIsRejectedForExternalTokenUse() {
    let evidence = TokenKeyEvidence(
        tokenBacked: false,
        secureEnclave: false,
        privateKey: true,
        rsa: true,
        canSign: true,
        keySizeInBits: 2048
    )
    #expect(!evidence.isEligibleExternalTokenKey)
}

@Test func generatedSecurityFrameworkSoftwareKeyIsRejectedForExternalTokenUse() throws {
    let parameters: [CFString: Any] = [
        kSecAttrKeyType: kSecAttrKeyTypeRSA,
        kSecAttrKeySizeInBits: 2048
    ]
    var error: Unmanaged<CFError>?
    let key = try #require(SecKeyCreateRandomKey(parameters as CFDictionary, &error))
    let attributes = try #require(SecKeyCopyAttributes(key) as? [CFString: Any])
    let evidence = TokenKeyEvidence(attributes: attributes)
    #expect(!evidence.tokenBacked)
    #expect(!evidence.isEligibleExternalTokenKey)
}

@Test func secureEnclaveKeyIsRejectedForExternalTokenUse() {
    let evidence = TokenKeyEvidence(
        tokenBacked: true,
        secureEnclave: true,
        privateKey: true,
        rsa: true,
        canSign: true,
        keySizeInBits: 2048
    )
    #expect(!evidence.isEligibleExternalTokenKey)
}

@Test func publicOrNonSigningKeyIsRejectedForExternalTokenUse() {
    let publicKey = TokenKeyEvidence(
        tokenBacked: true,
        secureEnclave: false,
        privateKey: false,
        rsa: true,
        canSign: true,
        keySizeInBits: 2048
    )
    let nonSigningKey = TokenKeyEvidence(
        tokenBacked: true,
        secureEnclave: false,
        privateKey: true,
        rsa: true,
        canSign: false,
        keySizeInBits: 2048
    )
    #expect(!publicKey.isEligibleExternalTokenKey)
    #expect(!nonSigningKey.isEligibleExternalTokenKey)
}

@Test func weakOrNonRsaKeyIsRejectedForExternalTokenUse() {
    let weakKey = TokenKeyEvidence(
        tokenBacked: true,
        secureEnclave: false,
        privateKey: true,
        rsa: true,
        canSign: true,
        keySizeInBits: 1024
    )
    let nonRsaKey = TokenKeyEvidence(
        tokenBacked: true,
        secureEnclave: false,
        privateKey: true,
        rsa: false,
        canSign: true,
        keySizeInBits: 256
    )
    #expect(!weakKey.isEligibleExternalTokenKey)
    #expect(!nonRsaKey.isEligibleExternalTokenKey)
}

@Test func replayGuardPersistsSuccessfulReservationsAcrossRestart() throws {
    let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let file = directory.appendingPathComponent("replay.jsonl")
    defer { try? FileManager.default.removeItem(at: directory) }
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let expiry = now.addingTimeInterval(120)
    let session = "3bd4615d-5d09-4b7a-a6b8-27f2b329cb19"

    let first = try PersistentReplayGuard(fileURL: file, now: now)
    try first.reserve(sessionId: session, expiresAt: expiry, now: now)
    let reopened = try PersistentReplayGuard(fileURL: file, now: now)
    var replayRejected = false
    do {
        try reopened.reserve(sessionId: session, expiresAt: expiry, now: now)
    } catch {
        replayRejected = true
    }
    #expect(replayRejected)
    try reopened.release(sessionId: session)
    try reopened.reserve(sessionId: session, expiresAt: expiry, now: now)
}

@Test func replayGuardRejectsPermissiveOrSymbolicLinkStores() throws {
    let directory = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let permissive = directory.appendingPathComponent("permissive.jsonl")
    let symbolicLink = directory.appendingPathComponent("link.jsonl")
    defer { try? FileManager.default.removeItem(at: directory) }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    FileManager.default.createFile(
        atPath: permissive.path,
        contents: Data(),
        attributes: [.posixPermissions: 0o644]
    )
    try FileManager.default.createSymbolicLink(at: symbolicLink, withDestinationURL: permissive)

    #expect(throws: (any Error).self) {
        _ = try PersistentReplayGuard(fileURL: permissive)
    }
    #expect(throws: (any Error).self) {
        _ = try PersistentReplayGuard(fileURL: symbolicLink)
    }
}
