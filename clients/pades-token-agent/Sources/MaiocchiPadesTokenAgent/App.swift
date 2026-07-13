import Foundation
import OSLog
import Vapor

@main
struct MaiocchiPadesTokenAgent {
    private static let version = "1.2.0"
    private static let logger = Logger(
        subsystem: "br.adv.maiocchi.pades-agent",
        category: "lifecycle"
    )

    private static var architecture: String {
        #if arch(arm64)
        "arm64"
        #else
        "unsupported"
        #endif
    }

    static func main() async throws {
        var environment = try Environment.detect()
        try LoggingSystem.bootstrap(from: &environment)
        let app = try await Application.make(environment)
        let store = TokenIdentityStore()
        let confirmation = NativeSignatureConfirmation()
        let allowed = Set(ProcessInfo.processInfo.environment["MAIOCCHI_ALLOWED_ORIGINS"]?
            .split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            ?? ["https://assinatura.maiocchi.adv.br", "http://127.0.0.1:35100", "http://localhost:3000"])

        app.http.server.configuration.hostname = "127.0.0.1"
        app.http.server.configuration.port = 35100
        app.http.server.configuration.requestDecompression = .disabled
        app.routes.defaultMaxBodySize = "2mb"

        let routes = app.grouped(LoopbackGuard(allowedOrigins: allowed))
        routes.on(.OPTIONS, "v1", ":endpoint") { _ in Response(status: .noContent) }
        routes.get("v1", "authorize") { _ -> Response in
            let response = Response(status: .ok, body: .init(string: AuthorizationPage.html))
            response.headers.contentType = .html
            response.headers.replaceOrAdd(
                name: .contentSecurityPolicy,
                value: "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' https://assinatura.maiocchi.adv.br; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
            )
            response.headers.replaceOrAdd(name: HTTPHeaders.Name("Referrer-Policy"), value: "no-referrer")
            response.headers.replaceOrAdd(name: HTTPHeaders.Name("X-Frame-Options"), value: "DENY")
            return response
        }
        routes.get("v1", "authorize.js") { _ -> Response in
            let response = Response(status: .ok, body: .init(string: AuthorizationPage.javascript))
            response.headers.contentType = HTTPMediaType(type: "text", subType: "javascript", parameters: ["charset": "utf-8"])
            return response
        }
        routes.get("v1", "status") { _ in
            AgentStatus(
                status: "ok",
                version: version,
                provider: "CryptoTokenKit",
                architecture: architecture,
                profile: "apple-silicon-native",
                tokenPolicy: "external-store-rsa-2048-fail-closed"
            )
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
            logger.notice("Local external-token signing operation completed")
            return SignResponse(
                sessionId: body.sessionId,
                signatureBase64: signature.base64EncodedString(),
                certificateFingerprintSha256: body.certificateFingerprintSha256
            )
        }

        do {
            logger.notice("Starting PAdES agent with fail-closed external-token policy")
            try await app.execute()
        } catch {
            logger.error("PAdES agent stopped after an execution error")
            try await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }
}
