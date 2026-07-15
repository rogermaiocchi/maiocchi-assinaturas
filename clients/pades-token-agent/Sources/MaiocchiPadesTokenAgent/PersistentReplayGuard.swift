import Foundation
import Vapor

final class PersistentReplayGuard: @unchecked Sendable {
    private struct Event: Codable {
        let sessionId: String
        let expiresAt: Date
        let active: Bool
    }

    private let lock = NSLock()
    private let fileURL: URL
    private var reservations: [String: Date]

    init(fileURL: URL? = nil, now: Date = Date()) throws {
        self.fileURL = try fileURL ?? Self.defaultFileURL()
        var loaded: [String: Date] = [:]
        if FileManager.default.fileExists(atPath: self.fileURL.path) {
            try Self.validateExistingFile(self.fileURL)
            let contents = try String(contentsOf: self.fileURL, encoding: .utf8)
            for line in contents.split(whereSeparator: { $0.isNewline }) {
                guard let data = line.data(using: .utf8),
                      let event = try? JSONDecoder().decode(Event.self, from: data) else {
                    throw Abort(.serviceUnavailable, reason: "Registro local de replay corrompido.")
                }
                if event.active, event.expiresAt > now {
                    loaded[event.sessionId] = event.expiresAt
                } else {
                    loaded.removeValue(forKey: event.sessionId)
                }
            }
        }
        reservations = loaded
    }

    func reserve(sessionId: String, expiresAt: Date, now: Date = Date()) throws {
        lock.lock()
        defer { lock.unlock() }
        reservations = reservations.filter { $0.value > now }
        guard reservations[sessionId] == nil else {
            throw Abort(.conflict, reason: "A sessão local já foi utilizada.")
        }
        try append(Event(sessionId: sessionId, expiresAt: expiresAt, active: true))
        reservations[sessionId] = expiresAt
    }

    func release(sessionId: String) throws {
        lock.lock()
        defer { lock.unlock() }
        let expiresAt = reservations[sessionId] ?? Date()
        try append(Event(sessionId: sessionId, expiresAt: expiresAt, active: false))
        reservations.removeValue(forKey: sessionId)
    }

    private func append(_ event: Event) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: fileURL.path) {
            guard FileManager.default.createFile(
                atPath: fileURL.path,
                contents: nil,
                attributes: [.posixPermissions: 0o600]
            ) else {
                throw Abort(.serviceUnavailable, reason: "Registro local de replay indisponível.")
            }
        }
        try Self.validateExistingFile(fileURL)
        var data = try JSONEncoder().encode(event)
        data.append(0x0A)
        let handle = try FileHandle(forWritingTo: fileURL)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
        try handle.synchronize()
    }

    private static func validateExistingFile(_ fileURL: URL) throws {
        let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else {
            throw Abort(.serviceUnavailable, reason: "Registro local de replay inseguro.")
        }
        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let permissions = (attributes[.posixPermissions] as? NSNumber)?.intValue ?? 0
        guard permissions & 0o077 == 0 else {
            throw Abort(.serviceUnavailable, reason: "Permissões do registro local de replay são inseguras.")
        }
    }

    private static func defaultFileURL() throws -> URL {
        guard let root = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw Abort(.serviceUnavailable, reason: "Diretório local de estado indisponível.")
        }
        return root
            .appendingPathComponent("Maiocchi/PadesTokenAgent", isDirectory: true)
            .appendingPathComponent("replay.jsonl", isDirectory: false)
    }
}
