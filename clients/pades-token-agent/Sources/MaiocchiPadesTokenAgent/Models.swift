import Foundation
import Vapor

struct AgentStatus: Content {
    let status: String
    let version: String
    let provider: String
}

struct CertificateDescriptor: Content {
    let fingerprintSha256: String
    let subject: String
    let certificateBase64: String
    let chainBase64: [String]
    let keyAlgorithm: String
}

struct CertificateList: Content {
    let certificates: [CertificateDescriptor]
}

struct SignRequest: Content {
    let sessionId: String
    let dataToSignBase64: String
    let digestAlgorithm: String
    let signatureAlgorithm: String
    let certificateFingerprintSha256: String
    let documentSha256: String
    let documentName: String
    let expiresAt: Date
}

struct SignResponse: Content {
    let sessionId: String
    let signatureBase64: String
    let certificateFingerprintSha256: String
}

struct ErrorEnvelope: Content {
    struct Detail: Content {
        let code: String
        let message: String
    }
    let error: Detail
}

enum AgentError: Error {
    case invalidRequest(String)
    case certificateNotFound
    case unsupportedKey
    case userCancelled
    case tokenFailure(String)
}
