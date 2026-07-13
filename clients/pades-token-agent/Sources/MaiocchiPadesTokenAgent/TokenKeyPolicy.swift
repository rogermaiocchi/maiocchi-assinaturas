import Foundation
import Security

struct TokenKeyEvidence: Equatable, Sendable {
    let tokenBacked: Bool
    let secureEnclave: Bool
    let privateKey: Bool
    let rsa: Bool
    let canSign: Bool
    let keySizeInBits: Int

    var isEligibleExternalTokenKey: Bool {
        tokenBacked && !secureEnclave && privateKey && rsa && canSign && keySizeInBits >= 2048
    }

    init(
        tokenBacked: Bool,
        secureEnclave: Bool,
        privateKey: Bool,
        rsa: Bool,
        canSign: Bool,
        keySizeInBits: Int
    ) {
        self.tokenBacked = tokenBacked
        self.secureEnclave = secureEnclave
        self.privateKey = privateKey
        self.rsa = rsa
        self.canSign = canSign
        self.keySizeInBits = keySizeInBits
    }

    init(attributes: [CFString: Any]) {
        let tokenID = attributes[kSecAttrTokenID] as? String
        self.init(
            tokenBacked: tokenID?.isEmpty == false,
            secureEnclave: tokenID.map {
                CFEqual($0 as CFString, kSecAttrTokenIDSecureEnclave)
            } ?? false,
            privateKey: Self.matches(attributes[kSecAttrKeyClass], kSecAttrKeyClassPrivate),
            rsa: Self.matches(attributes[kSecAttrKeyType], kSecAttrKeyTypeRSA),
            canSign: attributes[kSecAttrCanSign] as? Bool == true,
            keySizeInBits: (attributes[kSecAttrKeySizeInBits] as? NSNumber)?.intValue ?? 0
        )
    }

    private static func matches(_ value: Any?, _ expected: CFString) -> Bool {
        guard let value else { return false }
        return CFEqual(value as CFTypeRef, expected)
    }
}
