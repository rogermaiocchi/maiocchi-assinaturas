import Foundation
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
    #expect(!AuthorizationPage.html.contains("ticket="))
}
