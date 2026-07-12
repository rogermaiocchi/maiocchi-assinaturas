import Foundation
import Vapor

struct LoopbackGuard: AsyncMiddleware {
    let allowedOrigins: Set<String>

    func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
        let host = request.headers.first(name: .host)?.lowercased() ?? ""
        let loopbackHost = host == "127.0.0.1:35100" || host == "localhost:35100" || host == "[::1]:35100"
        guard loopbackHost else { return problem(.forbidden, "host_not_allowed", "Host local não autorizado.") }

        let origin = request.headers.first(name: .origin)
        guard let origin, allowedOrigins.contains(origin) else {
            return problem(.forbidden, "origin_not_allowed", "Origem não autorizada.")
        }
        if request.method == .OPTIONS {
            var response = Response(status: .noContent)
            applyCors(response: &response, origin: origin)
            response.headers.replaceOrAdd(name: .accessControlAllowMethods, value: "GET, POST, OPTIONS")
            response.headers.replaceOrAdd(name: .accessControlAllowHeaders, value: "content-type")
            response.headers.replaceOrAdd(name: .accessControlMaxAge, value: "600")
            return response
        }
        var response = try await next.respond(to: request)
        applyCors(response: &response, origin: origin)
        return response
    }

    private func applyCors(response: inout Response, origin: String) {
        response.headers.replaceOrAdd(name: .accessControlAllowOrigin, value: origin)
        response.headers.replaceOrAdd(name: .cacheControl, value: "no-store")
        response.headers.replaceOrAdd(name: .xContentTypeOptions, value: "nosniff")
        response.headers.replaceOrAdd(name: .vary, value: "Origin")
    }

    private func problem(_ status: HTTPResponseStatus, _ code: String, _ message: String) -> Response {
        let payload = ErrorEnvelope(error: .init(code: code, message: message))
        return (try? Response(status: status, body: .init(data: JSONEncoder().encode(payload)))) ?? Response(status: status)
    }
}
