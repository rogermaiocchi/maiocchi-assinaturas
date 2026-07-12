import Foundation
import Vapor

@main
struct MaiocchiPadesTokenAgent {
    static func main() async throws {
        var environment = try Environment.detect()
        try LoggingSystem.bootstrap(from: &environment)
        let app = try await Application.make(environment)
        let store = TokenIdentityStore()
        let confirmation = NativeSignatureConfirmation()
        let allowed = Set(ProcessInfo.processInfo.environment["MAIOCCHI_ALLOWED_ORIGINS"]?
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            ?? ["https://assinatura.maiocchi.adv.br", "http://localhost:3000"])

        app.http.server.configuration.hostname = "127.0.0.1"
        app.http.server.configuration.port = 35100
        app.http.server.configuration.requestDecompression = .disabled
        app.routes.defaultMaxBodySize = "2mb"

        let routes = app.grouped(LoopbackGuard(allowedOrigins: allowed))
        routes.get("v1", "status") { _ in
            AgentStatus(status: "ok", version: "1.0.0", provider: "CryptoTokenKit")
        }
        routes.get("v1", "certificates") { _ async throws -> CertificateList in
            CertificateList(certificates: try store.list())
        }
        routes.post("v1", "sign") { request async throws -> SignResponse in
            let body = try request.content.decode(SignRequest.self)
            guard UUID(uuidString: body.sessionId) != nil,
                  body.digestAlgorithm == "SHA-256",
                  body.signatureAlgorithm == "RSA-SHA256",
                  body.documentSha256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
                  body.certificateFingerprintSha256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
                  body.expiresAt > Date(), body.expiresAt.timeIntervalSinceNow <= 190,
                  let data = Data(base64Encoded: body.dataToSignBase64), !data.isEmpty, data.count <= 1024 * 1024 else {
                throw Abort(.badRequest, reason: "Tarefa de assinatura inválida ou expirada.")
            }
            try confirmation.confirm(documentName: body.documentName, documentSha256: body.documentSha256)
            let signature = try store.sign(data, fingerprint: body.certificateFingerprintSha256)
            return SignResponse(
                sessionId: body.sessionId,
                signatureBase64: signature.base64EncodedString(),
                certificateFingerprintSha256: body.certificateFingerprintSha256
            )
        }

        do {
            try await app.execute()
        } catch {
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }
}
