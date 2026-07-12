import CoreFoundation
import Foundation

protocol SignatureConfirmation: Sendable {
    func confirm(documentName: String, documentSha256: String) throws
}

struct NativeSignatureConfirmation: SignatureConfirmation {
    func confirm(documentName: String, documentSha256: String) throws {
        let message = "Documento: \(documentName)\nSHA-256: \(documentSha256)\n\nConfira o documento no portal antes de autorizar o token."
        var response: CFOptionFlags = 0
        let status = CFUserNotificationDisplayAlert(
            120,
            CFOptionFlags(kCFUserNotificationCautionAlertLevel),
            nil,
            nil,
            nil,
            "Assinar documento com certificado ICP-Brasil?" as CFString,
            message as CFString,
            "Assinar" as CFString,
            "Cancelar" as CFString,
            nil,
            &response
        )
        guard status == 0, response == CFOptionFlags(kCFUserNotificationDefaultResponse) else {
            throw AgentError.userCancelled
        }
    }
}
